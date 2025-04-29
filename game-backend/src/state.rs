use std::{net::SocketAddr, collections::HashMap};

const MAX_PING_AGE: usize = 10;

#[derive(Debug, Clone)]
pub struct Player {
    pub name: Option<String>,
    pub x: f32,
    pub z: f32,
}

pub struct GameState {
    seed: u32,
    players: HashMap<SocketAddr, Player>,
    balloon_height: f32,
    signal_strength: f32,
    ping: f32,
    avg_ping: f32,
    pings: Vec<f32>,
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
    pub fn countplayers(&self) -> usize {
        self.players.len()
    }

    pub fn get_state_string(&self, who: SocketAddr) -> String {
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
            state_str.push_str(&format!(";P[{}]:{:.2},{:.2}", name, player.x, player.z));
        }
        state_str
    }
}
