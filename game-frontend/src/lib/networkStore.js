import { writable, readable } from 'svelte/store';
import { browser } from '$app/environment';

let socket = null;

const _isConnected = writable(false);
const _seed = writable(null); 
const _balloonHeight = writable(0);
const _signalStrength = writable(0);
const _avgPing = writable(0.0);
const _playerCount = writable(0);
const _otherPlayers = writable({}); 
const _lastError = writable(null);

export const isConnected = readable(_isConnected.value, (set) => {
    return _isConnected.subscribe(set);
});
export const seed = readable(_seed.value, (set) => {
    _seed.subscribe(set); 
    return () => { }; 
});
export const balloonHeight = readable(_balloonHeight.value, (set) => {
    return _balloonHeight.subscribe(set);
});
export const signalStrength = readable(_signalStrength.value, (set) => {
    return _signalStrength.subscribe(set);
});
export const avgPing = readable(_avgPing.value, (set) => {
    return _avgPing.subscribe(set);
});
export const playerCount = readable(_playerCount.value, (set) => {
    return _playerCount.subscribe(set);
});
export const otherPlayers = readable(_otherPlayers.value, (set) => {
    return _otherPlayers.subscribe(set);
});
export const lastError = readable(_lastError.value, (set) => {
    return _lastError.subscribe(set);
});


function parseServerMessage(message) {
    const parts = message.split(';');
    const data = {};
    const playersData = {};

    parts.forEach(part => {
        let key = '';
        let value = '';

        const playerSeparatorIndex = part.indexOf(']:');
        if (part.startsWith('P[') && playerSeparatorIndex !== -1) {
            key = part.substring(0, playerSeparatorIndex + 1); 
            value = part.substring(playerSeparatorIndex + 2);
        } else {
            const genericSeparatorIndex = part.indexOf(':');
            if (genericSeparatorIndex !== -1) {
                key = part.substring(0, genericSeparatorIndex);
                value = part.substring(genericSeparatorIndex + 1);
            } else {
                return; 
            }
        }

        if (!key || value === undefined) {
            return;
        };

        switch (key) {
            case 'Seed':
                console.log("[networkStore] Received seed ", value);

                _seed.set(value); 

                data.seed = value; 
                break;
            case 'BalloonHeight':
                _balloonHeight.set(parseInt(value, 10));
                break;
            case 'Signal':
                _signalStrength.set(parseInt(value, 10));
                break;
            case 'AvgPing':
                _avgPing.set(parseFloat(value));
                break;
            case 'Players':
                _playerCount.set(parseInt(value, 10)); 
                break;
            default:
                if (key.startsWith('P[') && key.endsWith(']')) {
                    const playerId = key.substring(2, key.length - 1); 
                    const coords = value.split(',');
                    if (coords.length === 2) {
                        const x = parseFloat(coords[0]);
                        const z = parseFloat(coords[1]);
                        if (!isNaN(x) && !isNaN(z)) {
                            playersData[playerId] = { x, z };
                        } else {
                            console.warn(`[networkStore] Didn't parse ${playerId}:`, value);
                        }
                    } else {
                        console.warn(`[networkStore] Invalid coordinates ${playerId}:`, value);
                    }
                } else {
                    //forgot why I needed this else
                }
                break;
        }
    });
    console.log("[networkStore] playermaxxing:", JSON.stringify(playersData));
    _otherPlayers.set(playersData);
}


export function initializeWebSocket() {
    if (!browser || socket) {
        console.log("Either server|| alr connected");
        return;
    }
    const wsUrl = `ws://localhost:3000/ws`;
    //const wsUrl = `ws://${window.location.host}/ws`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("We ball");
        _isConnected.set(true);
        _lastError.set(null);
    };

    socket.onmessage = (event) => {
        parseServerMessage(event.data);
    };

    socket.onerror = (error) => {
        console.error("Errore WebSocket:", error);
        _lastError.set("Couldn't connect to server");
        _isConnected.set(false);
    };

    socket.onclose = (event) => {
        console.log("Disconnected? :", event.code, event.reason);
        _isConnected.set(false);
        socket = null;
        
        
    };
}

export function sendMove(x, z) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const message = `move ${x.toFixed(2)} ${z.toFixed(2)}`;
        
        socket.send(message);
    } else {
        
    }
}

export function closeWebSocket() {
    if (socket) {
        socket.close();
        socket = null;
        _isConnected.set(false);
        console.log("Manual ws close");
    }
}
