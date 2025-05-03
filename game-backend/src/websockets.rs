use axum::{
    Router,
    body::Bytes,
    extract::ws::{Message, Utf8Bytes, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::any,
    extract::State,
};
use axum_extra::TypedHeader;

use std::ops::ControlFlow;
use std::{net::SocketAddr, path::PathBuf, sync::{Arc, Mutex}};
use tower_http::{
    services::ServeDir,
    trace::{DefaultMakeSpan, TraceLayer},
};

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use axum::extract::connect_info::ConnectInfo;
use axum::extract::ws::CloseFrame;

use futures::{sink::SinkExt, stream::StreamExt};

use crate::state::GameState;

pub async fn run(state: Arc<Mutex<GameState>>) -> (){
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=debug,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let assets_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets");

    let app = Router::new()
        .fallback_service(ServeDir::new(assets_dir).append_index_html_on_directories(true))
        .route("/ws", any(ws_handler))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::default().include_headers(true)),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();
    tracing::debug!("listening on {}", listener.local_addr().unwrap());
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    user_agent: Option<TypedHeader<headers::UserAgent>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<Mutex<GameState>>>,
) -> impl IntoResponse {
    let user_agent = if let Some(TypedHeader(user_agent)) = user_agent {
        user_agent.to_string()
    } else {
        String::from("Unknown browser")
    };
    println!("`{user_agent}` at {addr} connected.");
    ws.on_upgrade(move |socket| handle_socket(socket, addr, state))
}

async fn handle_socket(mut socket: WebSocket, who: SocketAddr, state: Arc<Mutex<GameState>>) {
    state.lock().unwrap().add_player(who, None);

    if socket
        .send(Message::Ping(Bytes::from_static(&[1, 2, 3])))
        .await
        .is_ok()
    {
        println!("Pinged {who}...");
    } else {
        println!("Could not send ping {who}!");
        state.lock().unwrap().remove_player(who);
        return;
    }

    if let Some(msg) = socket.recv().await {
        if let Ok(msg) = msg {
            if process_message(msg, who, &state).is_break() {
                state.lock().unwrap().remove_player(who);
                return;
            }
        } else {
            println!("client {who} abruptly disconnected");
            state.lock().unwrap().remove_player(who);
            return;
        }
    }

    let (mut sender, mut receiver) = socket.split();

    let state_sender = state.clone();
    let sender_who = who.clone();
    let mut send_task = tokio::spawn(async move {
        // Variable to store the last state string sent
        let mut last_sent_state: Option<String> = None;

        loop {
            let current_state_string = state_sender.lock().unwrap().get_state_string(sender_who);

            let should_send = match &last_sent_state {
                Some(last) => *last != current_state_string,
                None => true,
            };

            if should_send {
                if sender.send(Message::Text(current_state_string.clone().into())).await.is_err() {
                    println!("Failed to send state to {sender_who}, closing connection.");
                    break;
                }
                last_sent_state = Some(current_state_string);
            }

            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        let _ = sender
            .send(Message::Close(Some(CloseFrame {
                code: axum::extract::ws::close_code::NORMAL,
                reason: Utf8Bytes::from_static("Server closing send task"),
            })))
            .await;
    });

    let state_receiver = state.clone();
    let mut recv_task = tokio::spawn(async move {
        let mut cnt = 0;
        while let Some(Ok(msg)) = receiver.next().await {
            cnt += 1;
            if process_message(msg, who, &state_receiver).is_break() {
                break;
            }
        }
        cnt
    });

    tokio::select! {
        rv_a = (&mut send_task) => {
            match rv_a {
                Ok(_) => println!("Send task for {who} finished.", ),
                Err(a) => println!("Error in send task for {who}: {a:?}")
            }
            recv_task.abort();
        },
        rv_b = (&mut recv_task) => {
            match rv_b {
                Ok(b) => println!("Receive task for {who} finished after {b} messages."),
                Err(b) => println!("Error in receive task for {who}: {b:?}")
            }
            send_task.abort();
        }
    }

    state.lock().unwrap().remove_player(who);
    println!("Websocket context {who} closed.");
}

fn process_message(msg: Message, who: SocketAddr, state: &Arc<Mutex<GameState>>) -> ControlFlow<(), ()> {
    match msg {
        Message::Text(t) => {
            println!(">>> {who} sent str: {t:?}");
            let parts: Vec<&str> = t.splitn(2, ' ').collect(); // Split into command and the rest

            match parts.as_slice() {
                // Handle "move x z"
                ["move", coords_str] => {
                    let coords: Vec<&str> = coords_str.split_whitespace().collect();
                    if coords.len() == 2 {
                        if let (Ok(x), Ok(z)) = (coords[0].parse::<f32>(), coords[1].parse::<f32>()) {
                            println!(">>> Parsed move command from {who}: x={x}, z={z}");
                            state.lock().unwrap().update_player(who, x, z);
                        } else {
                            println!(">>> Failed to parse move coordinates from {who}: {coords_str:?}");
                        }
                    } else {
                         println!(">>> Invalid move command format from {who}: {t:?}");
                    }
                }
                // Handle "chat message content"
                ["chat", message_content] => {
                    if !message_content.trim().is_empty() {
                        println!(">>> Parsed chat command from {who}: '{message_content}'");
                        // Add the chat message to the game state
                        state.lock().unwrap().add_chat_message(who, message_content.to_string());
                    } else {
                         println!(">>> Received empty chat message from {who}");
                    }
                }
                // Handle other potential commands or default case
                _ => {
                    println!(">>> Received unknown command format from {who}: {t:?}");
                }
            }
        }
        Message::Binary(d) => {
            println!(">>> {} sent {} bytes: {:?}", who, d.len(), d);
        }
        Message::Close(c) => {
            if let Some(cf) = c {
                println!(
                    ">>> {} sent close with code {} and reason `{}`",
                    who, cf.code, cf.reason
                );
            } else {
                println!(">>> {who} somehow sent close message without CloseFrame");
            }
            return ControlFlow::Break(());
        }
        Message::Pong(v) => {
            println!(">>> {who} sent pong with {v:?}");
        }
        Message::Ping(v) => {
            println!(">>> {who} sent ping with {v:?}");
        }
    }
    ControlFlow::Continue(())
}
