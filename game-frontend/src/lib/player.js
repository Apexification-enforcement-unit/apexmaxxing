import * as THREE from 'three';
import * as config from './config.js';

let playerMesh;

export function createPlayer(scene, initialPosition) {
    const playerGeometry = new THREE.CapsuleGeometry(config.playerRadius, config.playerHeight - 2 * config.playerRadius, 4, 16);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5 });
    playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    playerMesh.castShadow = true;

    playerMesh.position.copy(initialPosition);
    scene.add(playerMesh);
    return playerMesh;
}

export function calculatePlayerMovement(
    deltaTime,
    keysPressed,
    camera,
    pointerLockControls,
    playerPosition,
    playerVelocityY,
    isGrounded,
    getTerrainHeightAt
) {
    const moveSpeed = config.playerSpeed * deltaTime;
    const moveDirection = new THREE.Vector3();
    let movedHorizontally = false;

    const cameraDirection = new THREE.Vector3();
    const rightDirection = new THREE.Vector3();
    const upVector = new THREE.Vector3(0, 1, 0);

    if (pointerLockControls && pointerLockControls.isLocked) {
        pointerLockControls.getDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();
        rightDirection.crossVectors(cameraDirection, upVector).normalize();
    } else if (camera) {
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();
        rightDirection.crossVectors(cameraDirection, upVector).normalize();
    }

    if (keysPressed['w']) {
        moveDirection.add(cameraDirection);
        movedHorizontally = true;
    }
    if (keysPressed['s']) {
        moveDirection.sub(cameraDirection);
        movedHorizontally = true;
    }
    if (keysPressed['a']) {
        moveDirection.sub(rightDirection);
        movedHorizontally = true;
    }
    if (keysPressed['d']) {
        moveDirection.add(rightDirection);
        movedHorizontally = true;
    }

    if (movedHorizontally && moveDirection.lengthSq() > 0.0001) {
        moveDirection.normalize().multiplyScalar(moveSpeed);
        playerPosition.add(moveDirection);

        const halfSize = config.terrainSize / 2;
        playerPosition.x = Math.max(-halfSize + config.playerRadius, Math.min(halfSize - config.playerRadius, playerPosition.x));
        playerPosition.z = Math.max(-halfSize + config.playerRadius, Math.min(halfSize - config.playerRadius, playerPosition.z));
    }

    playerVelocityY += config.gravity * deltaTime;
    playerPosition.y += playerVelocityY * deltaTime;

    const currentGroundHeight = getTerrainHeightAt(playerPosition.x, playerPosition.z);
    const playerBottomY = playerPosition.y - config.playerHeight / 2;

    let newGroundedState = isGrounded;
    let newVelocityY = playerVelocityY;

    if (playerBottomY <= currentGroundHeight) {
        playerPosition.y = currentGroundHeight + config.playerHeight / 2;
        newVelocityY = 0;
        newGroundedState = true;
    } else {
        newGroundedState = false;
    }

    return {
        updatedPosition: playerPosition,
        updatedVelocityY: newVelocityY,
        updatedGroundedState: newGroundedState
    };
}

export function handleJump(isGrounded) {
    if (isGrounded) {
        return {
            newVelocityY: config.jumpStrength,
            newGroundedState: false
        };
    }

    return null;
}

export function disposePlayerAssets() {
    playerMesh?.geometry.dispose();
    playerMesh?.material.dispose();
    playerMesh = null;
}
