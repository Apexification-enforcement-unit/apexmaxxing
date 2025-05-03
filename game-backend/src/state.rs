use std::{net::SocketAddr, collections::{HashMap, VecDeque}};

const MAX_PING_AGE: usize = 10;
const MAX_CHAT_MESSAGES: usize = 15; // Maximum number of chat messages to store

#[derive(Debug, Clone)]
pub struct Player {
    pub name: Option<String>,
    pub x: f32,
    pub z: f32,
}

#[derive(Debug, Clone)]
struct ChatMessage {
    sender_name: String,
    message: String,
}

pub struct GameState {
    seed: u32,
    players: HashMap<SocketAddr, Player>,
    balloon_height: f32,
    signal_strength: f32,
    ping: f32,
    avg_ping: f32,
    pings: Vec<f32>,
    chat_messages: VecDeque<ChatMessage>, // Store recent chat messages
}

impl GameState {
    pub fn new() -> Self {
        Self {
            seed: 31415988,
            players: HashMap::new(),
            balloon_height: 0.0,
            signal_strength: 0.0,
            ping: 0.0,
            avg_ping: 0.0,
            pings: Vec::new(),
            chat_messages: VecDeque::with_capacity(MAX_CHAT_MESSAGES), // Initialize chat messages
        }
    }
    pub fn add_player(&mut self, addr: SocketAddr, name: Option<String>) {
        println!("Adding player: {}", addr);
        self.players.insert(addr, Player { name: name, x: 0.0, z: 0.0 });
    }
    pub fn remove_player(&mut self, addr: SocketAddr) {
        println!("Removing player: {}", addr);
        self.players.remove(&addr);
    }
    pub fn update_player(&mut self, addr: SocketAddr, x: f32, z: f32) {
        if let Some(player) = self.players.get_mut(&addr) {
            player.x = x;
            player.z = z;
        }
    }
    pub fn calculate_avg_ping(&mut self) {
        if self.pings.len() > 0 {
            let sum: f32 = self.pings.iter().sum();
            self.avg_ping = sum / self.pings.len() as f32;
        }
    }
    pub fn add_ping(&mut self, ping: f32) {
        self.pings.push(ping);
        if self.pings.len() > MAX_PING_AGE {
            self.pings.remove(0);
        }
        self.calculate_avg_ping();
    }

    // Method to add a chat message
    pub fn add_chat_message(&mut self, sender_addr: SocketAddr, message: String) {
        let sender_name: String = self.players.get(&sender_addr)
            .and_then(|p: &Player| p.name.clone())
            .unwrap_or_else(|| sender_addr.to_string()); // Use address if name is not set

        let chat_message = ChatMessage { sender_name, message };

        if self.chat_messages.len() >= MAX_CHAT_MESSAGES {
            self.chat_messages.pop_front(); // Remove the oldest message
        }
        self.chat_messages.push_back(chat_message); // Add the new message
        println!("Chat message added: {}", self.chat_messages.back().unwrap().message); // Log added message
    }

    pub fn countplayers(&self) -> usize {
        self.players.len()
    }

    pub fn get_state_string(&self, who: SocketAddr) -> String {
        // Serialize other players' positions
        let players_string = self.players.iter()
            .filter(|&(&addr, _)| addr != who) // Exclude the requesting player
            .map(|(addr, player)| {
                format!("P[{}]:{:.2},{:.2}",
                        player.name.clone().unwrap_or_else(|| addr.to_string()), // Use name or address
                        player.x,
                        player.z)
            })
            .collect::<Vec<String>>()
            .join(";");

        // Serialize chat messages
        let chat_string = self.chat_messages.iter()
            .map(|msg| format!("{}>{}", msg.sender_name, msg.message)) // Format as Sender>Message
            .collect::<Vec<String>>()
            .join(";"); // Join messages with ;

        // Combine all parts
        let mut state_parts = vec![
            format!("Seed:{}", self.seed),
            format!("BalloonHeight:{}", self.balloon_height),
            format!("Signal:{}", self.signal_strength),
            format!("AvgPing:{:.2}", self.avg_ping),
            format!("Players:{}", self.countplayers().saturating_sub(1)), // Count *other* players
        ];

        if !players_string.is_empty() {
            state_parts.push(players_string);
        }

        // Add chat messages if any exist, prefixed with "Chat:"
        if !chat_string.is_empty() {
            state_parts.push(format!("Chat:{}", chat_string));
        }

        state_parts.join(";") // Join all parts with ;
    }

    pub fn get_init_state_string(&self, who: SocketAddr) -> String {
        let other_players_count = self.players.iter().filter(|&(&addr, _)| addr != who).count();

        let mut state_str = format!(
            "Seed:{};BalloonHeight:{};Signal:{};AvgPing:{:.2};Players:{}",
            self.seed, self.balloon_height, self.signal_strength, self.avg_ping, other_players_count
        );
        for (addr, player) in &self.players {
            if *addr == who {
                continue;
            }
            let name = player.name.clone().unwrap_or_else(|| addr.to_string());
            state_str.push_str(&format!(";P[{}]:{:.2},{:.2}", name.replace(';', ""), player.x, player.z));
        }

        state_str
    }
}
