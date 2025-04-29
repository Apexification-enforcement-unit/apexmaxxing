import * as THREE from 'three';
import * as config from './config.js';
import { noise3D, noise3D_lowFreq, noise3D_region, createSeededRandom } from './noise.js';

let terrainMesh, waterMesh, trunkInstanceMesh, leavesInstanceMesh;

export function getTerrainHeightAt(x, z) {
    if (!noise3D || !noise3D_lowFreq || !noise3D_region) return 0;

    const rawRegionVal = noise3D_region(x * config.noiseScale_region, z * config.noiseScale_region, 0.1);
    let regionValNormalized = (rawRegionVal + 1) / 2;

    const regionPower = 1.8;
    let regionValTransformed = Math.pow(regionValNormalized, regionPower);

    const regionHeight = regionValTransformed * config.heightMultiplier_region;

    const rawLowFreqVal = noise3D_lowFreq(x * config.noiseScale_lowFreq, z * config.noiseScale_lowFreq, 0.1);
    const lowFreqValNormalized = (rawLowFreqVal + 1) / 2;

    const lowFreqMultiplier = config.heightMultiplier_lowFreq * (0.4 + regionValNormalized * 0.8);
    const lowFreqHeight = lowFreqValNormalized * lowFreqMultiplier;

    const rawHighFreqVal = noise3D(x * config.noiseScale_highFreq, z * config.noiseScale_highFreq, 0.1);
    const highFreqValNormalized = (rawHighFreqVal + 1) / 2;

    const highFreqMultiplier = config.heightMultiplier_highFreq * (0.6 + regionValNormalized * 0.6);
    const highFreqHeight = highFreqValNormalized * highFreqMultiplier;

    const finalHeight = regionHeight + lowFreqHeight + highFreqHeight;

    return finalHeight;
}

export function createTerrain(scene, mainSeed) {
    const textureLoader = new THREE.TextureLoader();
    const basePath = '/assets/grass0/';
    const grassBaseColor = textureLoader.load(basePath + '4K_BaseColor.jpg');
    const grassNormalMap = textureLoader.load(basePath + '4K_Normal.jpg');
    const grassRoughnessMap = textureLoader.load(basePath + '4K_Roughness.jpg');
    const grassAOMap = textureLoader.load(basePath + '4K_AO.jpg');
    const grassDisplacementMap = textureLoader.load(basePath + '4K_Displacement.jpg');
    const textures = [grassBaseColor, grassNormalMap, grassRoughnessMap, grassAOMap, grassDisplacementMap];
    textures.forEach(texture => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(config.textureRepeat, config.textureRepeat);
    });
    console.log("Texturemaxxed");

    const terrainGeometry = new THREE.PlaneGeometry(config.terrainSize, config.terrainSize, config.terrainSegments, config.terrainSegments);
    terrainGeometry.rotateX(-Math.PI / 2);
    terrainGeometry.setAttribute('uv2', new THREE.BufferAttribute(terrainGeometry.attributes.uv.array, 2));

    const positionAttribute = terrainGeometry.attributes.position;
    const colors = [];
    const tempColor = new THREE.Color();
    const treePositions = [];
    const minTreeDistSq = config.minTreeDist * config.minTreeDist;
    const placementRngSeedBase = mainSeed + "-placement";

    for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const z = positionAttribute.getZ(i);
        const height = getTerrainHeightAt(x, z);
        positionAttribute.setY(i, height);

        if (height < config.waterLevel) {
            tempColor.set("#C2B280");
        } else if (height < config.sandLevel) {
            tempColor.set("#C2B280");
        } else {
            tempColor.set("#FFFFFF");

            if (height >= config.treePlacementThreshold) {
                const posSeed = `${placementRngSeedBase}-${x.toFixed(2)}-${z.toFixed(2)}`;
                const placementRng = createSeededRandom(posSeed);
                if (placementRng() < config.treePlacementDensity) {
                    let tooClose = false;
                    for (const pos of treePositions) {
                        const dx = pos.x - x;
                        const dz = pos.z - z;
                        if (dx * dx + dz * dz < minTreeDistSq) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (!tooClose && treePositions.length < config.maxTreeCount) {
                        treePositions.push({ x: x, y: height, z: z });
                    }
                }
            }
        }
        colors.push(tempColor.r, tempColor.g, tempColor.b);
    }
    terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    terrainGeometry.computeVertexNormals();

    const terrainMaterial = new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide,
        metalness: 0.1,
        roughness: 2,
        map: grassBaseColor,
        normalMap: grassNormalMap,
        roughnessMap: grassRoughnessMap,
        aoMap: grassAOMap,
        aoMapIntensity: 1,
        displacementMap: grassDisplacementMap,
        displacementScale: 0.4,
        vertexColors: true
    });

    terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrainMesh.castShadow = true;
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    createWater(scene);
    createTrees(scene, treePositions, mainSeed);

    return { terrainMesh, waterMesh, trunkInstanceMesh, leavesInstanceMesh };
}

function createWater(scene) {
    const waterGeometry = new THREE.PlaneGeometry(config.terrainSize, config.terrainSize);
    waterGeometry.rotateX(-Math.PI / 2);
    const waterMaterial = new THREE.MeshStandardMaterial({
        color: 0x4682B4,
        metalness: 0.6,
        roughness: 0.2,
        transparent: true,
        opacity: 0.85,
    });
    waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    waterMesh.position.y = config.waterLevel;
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);
}

function createTrees(scene, treePositions, mainSeed) {
    const trunkGeometry = new THREE.CylinderGeometry(config.trunkRadius, config.trunkRadius, config.trunkHeight, 8);
    const leavesGeometry = new THREE.ConeGeometry(config.leavesRadius, config.leavesHeight, 8);
    leavesGeometry.translate(0, config.trunkHeight / 2 + config.leavesHeight / 2, 0);

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: "#8B4513" });
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: "#2E8B57" });

    const actualTreeCount = treePositions.length;
    if (actualTreeCount > 0) {
        trunkInstanceMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, actualTreeCount);
        leavesInstanceMesh = new THREE.InstancedMesh(leavesGeometry, leavesMaterial, actualTreeCount);
        trunkInstanceMesh.castShadow = true;
        leavesInstanceMesh.castShadow = true;

        const dummy = new THREE.Object3D();
        const variationRngSeedBase = mainSeed + "-variation";

        for (let i = 0; i < actualTreeCount; i++) {
            const pos = treePositions[i];
            const treeSeed = `${variationRngSeedBase}-${i}-${pos.x.toFixed(1)}-${pos.z.toFixed(1)}`;
            const variationRng = createSeededRandom(treeSeed);

            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.rotation.y = variationRng() * Math.PI * 2;
            const scaleVariation = 0.8 + variationRng() * 0.4;
            dummy.scale.set(scaleVariation, scaleVariation, scaleVariation);
            dummy.updateMatrix();
            trunkInstanceMesh.setMatrixAt(i, dummy.matrix);
            leavesInstanceMesh.setMatrixAt(i, dummy.matrix);
        }
        trunkInstanceMesh.instanceMatrix.needsUpdate = true;
        leavesInstanceMesh.instanceMatrix.needsUpdate = true;
        scene.add(trunkInstanceMesh);
        scene.add(leavesInstanceMesh);
    }
}

export function disposeTerrainAssets() {
    terrainMesh?.geometry.dispose();
    if (terrainMesh?.material) {
        terrainMesh.material.map?.dispose();
        terrainMesh.material.normalMap?.dispose();
        terrainMesh.material.roughnessMap?.dispose();
        terrainMesh.material.aoMap?.dispose();
        terrainMesh.material.displacementMap?.dispose();
        terrainMesh.material.dispose();
    }
    waterMesh?.geometry.dispose();
    waterMesh?.material.dispose();
    trunkInstanceMesh?.geometry.dispose();
    trunkInstanceMesh?.material.dispose();
    leavesInstanceMesh?.geometry.dispose();
    leavesInstanceMesh?.material.dispose();

    terrainMesh = null;
    waterMesh = null;
    trunkInstanceMesh = null;
    leavesInstanceMesh = null;
}
