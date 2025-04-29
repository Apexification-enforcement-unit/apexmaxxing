<script>
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

    import * as config from './config.js';
    import { setupNoiseFunctions } from './noise.js';
    import { initThreeScene, disposeThreeObjects, handleResize as handleCoreResize } from './threeCore.js';
    import { createTerrain, getTerrainHeightAt, disposeTerrainAssets } from './terrain.js';
    import { createPlayer, calculatePlayerMovement, handleJump, disposePlayerAssets } from './player.js';
    import { sendMove, otherPlayers, isConnected, seed } from './networkStore.js';

    let canvasContainer;

    let scene, camera, renderer, controls, pointerLockControls;
    let animationFrameId;
    let clock;

    let terrainMesh, waterMesh, trunkInstanceMesh, leavesInstanceMesh;
    let playerMesh;
    let otherPlayerMeshes = new Map();
    let otherPlayerGeometry, otherPlayerMaterial;

    let playerPosition = new THREE.Vector3(5, 0, 5);
    let lastSentPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    const positionSendThresholdSq = 0.1 * 0.1;

    let playerVelocityY = 0;
    let isGrounded = false;
    let keysPressed = {};

    let cameraMode = config.initialCameraMode;
    let thirdPersonTargetOffset = new THREE.Vector3(config.thirdPersonOffset.x, config.thirdPersonOffset.y, config.thirdPersonOffset.z);

    let worldInitialized = false;
    let unsubscribeSeed = null;
    let unsubscribeOtherPlayers = null;

    onMount(async () => {
        if (!browser) return;

        unsubscribeSeed = seed.subscribe(currentSeed => {
            if (!currentSeed) {
                return;
            }
            if (currentSeed && !worldInitialized && browser) {
                worldInitialized = true;

                setupNoiseFunctions(currentSeed);

                const startX = 5;
                const startZ = 5;
                const initialGroundHeight = getTerrainHeightAt(startX, startZ);
                playerPosition.set(startX, initialGroundHeight + config.playerHeight / 2 + 0.1, startZ);
                lastSentPosition.copy(playerPosition);

                const core = initThreeScene(canvasContainer, playerPosition);
                scene = core.scene;
                camera = core.camera;
                renderer = core.renderer;
                controls = core.controls;
                pointerLockControls = core.pointerLockControls;

                const terrainAssets = createTerrain(scene, currentSeed);
                terrainMesh = terrainAssets.terrainMesh;
                waterMesh = terrainAssets.waterMesh;
                trunkInstanceMesh = terrainAssets.trunkInstanceMesh;
                leavesInstanceMesh = terrainAssets.leavesInstanceMesh;

                playerMesh = createPlayer(scene, playerPosition);

                otherPlayerGeometry = new THREE.CapsuleGeometry(config.playerRadius, config.playerHeight - 2 * config.playerRadius, 4, 8);
                otherPlayerMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff, roughness: 0.6 });

                clock = new THREE.Clock();

                window.addEventListener("resize", onWindowResize);
                window.addEventListener("keydown", onKeyDown);
                window.addEventListener("keyup", onKeyUp);
                canvasContainer?.addEventListener('click', onCanvasClick);
                setupPointerLockListeners();

                unsubscribeOtherPlayers = otherPlayers.subscribe(playersData => {
                    if (!scene || !browser || !isConnected) return;

                    const receivedPlayerIds = new Set(Object.keys(playersData));

                    for (const playerId in playersData) {
                        const posData = playersData[playerId];
                        if (typeof posData.x !== 'number' || typeof posData.z !== 'number' || isNaN(posData.x) || isNaN(posData.z)) {
                            continue;
                        }

                        const groundHeight = getTerrainHeightAt(posData.x, posData.z);

                        if (isNaN(groundHeight)) {
                            continue;
                        }

                        const playerY = groundHeight + config.playerHeight / 2;

                        if (otherPlayerMeshes.has(playerId)) {
                            const mesh = otherPlayerMeshes.get(playerId);
                            mesh.position.set(posData.x, playerY, posData.z);
                        } else {
                            const newMesh = new THREE.Mesh(otherPlayerGeometry, otherPlayerMaterial);
                            newMesh.position.set(posData.x, playerY, posData.z);
                            newMesh.castShadow = true;
                            newMesh.name = `player_${playerId}`;
                            scene.add(newMesh);
                            otherPlayerMeshes.set(playerId, newMesh);
                        }
                    }

                    otherPlayerMeshes.forEach((mesh, playerId) => {
                        if (!receivedPlayerIds.has(playerId)) {
                            scene.remove(mesh);
                            otherPlayerMeshes.delete(playerId);
                        }
                    });
                });

                animate();

                if (unsubscribeSeed) {
                    unsubscribeSeed();
                    unsubscribeSeed = null;
                }
            } else if (currentSeed && worldInitialized) {
                if (unsubscribeSeed) {
                    unsubscribeSeed();
                    unsubscribeSeed = null;
                }
            }
        });

        return () => {
            if (unsubscribeSeed) {
                unsubscribeSeed();
            }
        };
    });

    onDestroy(() => {
        if (!browser) return;
        if (unsubscribeSeed) unsubscribeSeed();
        if (unsubscribeOtherPlayers) unsubscribeOtherPlayers();

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener("resize", onWindowResize);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        canvasContainer?.removeEventListener('click', onCanvasClick);
        removePointerLockListeners();

        otherPlayerMeshes.forEach(mesh => scene?.remove(mesh));
        otherPlayerMeshes.clear();
        otherPlayerGeometry?.dispose();
        otherPlayerMaterial?.dispose();

        disposePlayerAssets();
        disposeTerrainAssets();
        disposeThreeObjects();

        worldInitialized = false;
        scene = null; camera = null; renderer = null; controls = null; pointerLockControls = null;
        terrainMesh = null; waterMesh = null; trunkInstanceMesh = null; leavesInstanceMesh = null;
        playerMesh = null; clock = null; playerPosition = new THREE.Vector3(5, 0, 5);
        keysPressed = {};
    });

    function onWindowResize() {
        handleCoreResize(camera, renderer, canvasContainer);
    }

    function onKeyDown(event) {
        const key = event.key.toLowerCase();
        keysPressed[key] = true;

        if (key === 'v') {
            toggleCameraMode();
        }

        if (key === ' ' && isGrounded) {
            const jumpResult = handleJump(isGrounded);
            if (jumpResult) {
                playerVelocityY = jumpResult.newVelocityY;
                isGrounded = jumpResult.newGroundedState;
            }
        }
    }

    function onKeyUp(event) {
        keysPressed[event.key.toLowerCase()] = false;
    }

    function onCanvasClick() {
        if (cameraMode === 'first-person' && pointerLockControls && !pointerLockControls.isLocked) {
            pointerLockControls.lock();
        }
    }

    const onPointerLockChange = () => {
        if (pointerLockControls?.isLocked) {
            controls.enabled = false;
        } else {
            controls.enabled = cameraMode === 'third-person';
        }
    };

    const onPointerLockError = () => {};

    function setupPointerLockListeners() {
        if (pointerLockControls) {
            pointerLockControls.addEventListener('lock', onPointerLockChange);
            pointerLockControls.addEventListener('unlock', onPointerLockChange);
        }
    }

    function removePointerLockListeners() {
        if (pointerLockControls) {
            pointerLockControls.removeEventListener('lock', onPointerLockChange);
            pointerLockControls.removeEventListener('unlock', onPointerLockChange);
        }
    }

    function toggleCameraMode() {
        cameraMode = cameraMode === 'third-person' ? 'first-person' : 'third-person';

        if (cameraMode === 'first-person') {
            controls.enabled = false;
            if (pointerLockControls) pointerLockControls.lock();
        } else {
            if (pointerLockControls) pointerLockControls.unlock();
            controls.enabled = true;
            if (playerPosition) controls.target.copy(playerPosition);
        }
        controls.enableDamping = cameraMode === 'third-person';
    }

    function updateCamera(deltaTime) {
        if (!camera || !playerPosition) return;

        if (cameraMode === 'third-person') {
            controls.target.copy(playerPosition);
            controls.update();
        } else {
            const eyePosition = playerPosition.clone().add(new THREE.Vector3(0, config.firstPersonEyeHeight - config.playerHeight / 2, 0));
            pointerLockControls?.getObject().position.copy(eyePosition);
        }
    }

    function animate() {
        if (!browser || !scene || !camera || !renderer || !clock || !playerMesh || !playerPosition) {
            return;
        }

        animationFrameId = requestAnimationFrame(animate);
        const deltaTime = clock.getDelta();

        const playerStateUpdate = calculatePlayerMovement(
            deltaTime,
            keysPressed,
            camera,
            pointerLockControls,
            playerPosition,
            playerVelocityY,
            isGrounded,
            getTerrainHeightAt
        );

        playerVelocityY = playerStateUpdate.updatedVelocityY;
        isGrounded = playerStateUpdate.updatedGroundedState;

        playerMesh.position.copy(playerPosition);

        const distanceSq = playerPosition.distanceToSquared(lastSentPosition);
        if (distanceSq > positionSendThresholdSq) {
            sendMove(playerPosition.x, playerPosition.z);
            lastSentPosition.copy(playerPosition);
        }

        updateCamera(deltaTime);

        renderer.render(scene, camera);
    }

</script>

<div class="scene-container" bind:this={canvasContainer}></div>

<style>
    .scene-container {
        width: 100%;
        height: 100vh;
        display: block;
        overflow: hidden;
        cursor: crosshair;
    }

    :global(body) {
        margin: 0;
    }
</style>