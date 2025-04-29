<script>
    import { onMount, onDestroy } from 'svelte';
    import Scene from "$lib/Scene.svelte";
    import { initializeWebSocket, closeWebSocket, balloonHeight, signalStrength, avgPing, playerCount, isConnected, lastError } from '$lib/networkStore.js';

    onMount(() => {
        initializeWebSocket();
        return () => {
            closeWebSocket();
        };
    });
</script>

<div class="app-container">
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
        background-color: rgba(255, 255, 255, 0.7);
        border-radius: 5px;
        color: #333;
        font-family: sans-serif;
        z-index: 100;
        text-align: left; 
    }
</style>
