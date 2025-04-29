import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import * as config from './config.js';

let scene, camera, renderer, controls, pointerLockControls;
let hemisphereLight, directionalLight;

export function initThreeScene(canvasContainer, initialPlayerPosition) {

    scene = new THREE.Scene();
    scene.background = new THREE.Color("#add8e6");
    scene.fog = new THREE.Fog(scene.background, config.fogNear, config.fogFar);

    camera = new THREE.PerspectiveCamera(
        75,
        canvasContainer.clientWidth / canvasContainer.clientHeight,
        0.1,
        1000
    );

    camera.position.set(initialPlayerPosition.x + config.thirdPersonOffset.x, initialPlayerPosition.y + config.thirdPersonOffset.y, initialPlayerPosition.z + config.thirdPersonOffset.z);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);

    hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.8);
    scene.add(hemisphereLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(80, 100, 50);
    directionalLight.castShadow = true;

    directionalLight.shadow.mapSize.width = config.shadowMapSize;
    directionalLight.shadow.mapSize.height = config.shadowMapSize;

    const shadowCamSize = config.terrainSize / 2;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = config.terrainSize * 2;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    scene.add(directionalLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.copy(initialPlayerPosition);
    controls.enabled = config.initialCameraMode === 'third-person';
    controls.update();

    pointerLockControls = new PointerLockControls(camera, renderer.domElement);

    return { scene, camera, renderer, controls, pointerLockControls };
}

export function disposeThreeObjects() {
    console.log("Arsoning three.js objects...");

    if (hemisphereLight) scene?.remove(hemisphereLight);
    if (directionalLight) {
        directionalLight.shadow?.map?.dispose();
        scene?.remove(directionalLight);
    }
    hemisphereLight = null;
    directionalLight = null;

    controls?.dispose();
    pointerLockControls?.dispose();
    controls = null;
    pointerLockControls = null;

    renderer?.dispose();
    if (renderer?.domElement?.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null;

    scene = null;
    camera = null;
}

export function handleResize(camera, renderer, canvasContainer) {
    if (!camera || !renderer || !canvasContainer) return;
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}
