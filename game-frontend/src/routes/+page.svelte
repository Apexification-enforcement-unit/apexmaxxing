<script>
    import { onMount, onDestroy } from 'svelte';
    import Scene from "$lib/Scene.svelte";
    import {
        initializeWebSocket,
        closeWebSocket,
        balloonHeight,
        signalStrength,
        avgPing,
        playerCount,
        isConnected,
        lastError,
        chatMessages,
        sendChatMessage
    } from '$lib/networkStore.js';

    let chatInput = '';

    onMount(() => {
        initializeWebSocket();
        return () => {
            closeWebSocket();
        };
    });

    function handleChatSubmit() {
        if (chatInput.trim()) {
            sendChatMessage(chatInput);
            chatInput = '';
        }
    }

    function handleKeyDown(event) {
        if (event.target.id === 'chat-input') {
            event.stopPropagation();
            if (event.key === 'Enter') {
                handleChatSubmit();
            }
        }
    }

    $: console.log("Chat messages in component:", $chatMessages); // Add reactive log

</script>

<div class="app-container" on:keydown={handleKeyDown}>
    <Scene />
    <div id="info">
        {#if $isConnected}
            Balloon: {$balloonHeight}ft | Signal: {$signalStrength} dbs | Ping: {$avgPing.toFixed(2)}ms | Players: {$playerCount}
        {:else if $lastError}
            Connection Error: {$lastError}
        {:else}
            Connecting...
        {/if}
    </div>

    <div id="chat-container">
        <div id="chat-messages">
             <p style="color: yellow; font-size: 0.7em;">Msg Count: {$chatMessages.length}</p> <!-- Add count display -->
            {#each $chatMessages as msg, i (msg.sender + msg.message + i)} <!-- Use index 'i' in key -->
                <div class="chat-message">
                    <strong>{msg.sender}:</strong> {msg.message}
                </div>
            {/each}
        </div>
        <div id="chat-input-area">
            <input
                type="text"
                id="chat-input"
                placeholder="Type message..."
                bind:value={chatInput}
                maxlength="100"
            />
            <button on:click={handleChatSubmit}>Send</button>
        </div>
    </div>

</div>

<style>
    .app-container {
        position: relative;
        height: 100vh;
        width: 100vw;
        background-color: #add8e6;
        overflow: hidden;
    }
    #info {
        position: absolute;
        top: 10px;
        left: 10px;
        width: auto;
        padding: 5px 10px;
        background-color: rgba(0, 0, 0, 0.5);
        border-radius: 5px;
        color: #fff;
        font-family: sans-serif;
        font-size: 0.9em;
        z-index: 100;
        text-align: left;
    }

    #chat-container {
        position: absolute;
        bottom: 10px;
        left: 10px;
        width: 300px;
        max-height: 200px;
        background-color: rgba(0, 0, 0, 0.6);
        border-radius: 5px;
        color: #fff;
        font-family: sans-serif;
        font-size: 0.8em;
        z-index: 100;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    #chat-messages {
        flex-grow: 1;
        overflow-y: auto;
        padding: 8px;
        display: flex;
        flex-direction: column-reverse;
    }

     .chat-message {
        margin-bottom: 4px;
        word-wrap: break-word;
    }
     .chat-message strong {
        color: #aaa;
        margin-right: 5px;
    }

    #chat-input-area {
        display: flex;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        padding: 5px;
    }

    #chat-input {
        flex-grow: 1;
        background-color: rgba(255, 255, 255, 0.1);
        border: none;
        color: #fff;
        padding: 4px 6px;
        border-radius: 3px;
        margin-right: 5px;
        outline: none;
    }
     #chat-input::placeholder {
        color: #ccc;
    }

    #chat-input-area button {
        background-color: #555;
        border: none;
        color: #fff;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
    }
     #chat-input-area button:hover {
        background-color: #777;
    }

</style>
