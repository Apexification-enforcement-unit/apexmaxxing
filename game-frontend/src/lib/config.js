export const seed = "cool seed";


export const terrainSize = 1000;
export const terrainSegments = Math.round(12.8 * Math.sqrt(terrainSize));


export const noiseScale_region = 0.015;
export const heightMultiplier_region = 10;


export const noiseScale_lowFreq = 0.04;
export const heightMultiplier_lowFreq = 8;


export const noiseScale_highFreq = 0.08;
export const heightMultiplier_highFreq = 2.5;

export const waterLevel = 2.0;
export const sandLevel = waterLevel + 0.7;
export const grassLevel = sandLevel + 4.0;
export const textureRepeat = Math.round(60 * (terrainSize / 100));


export const maxTreeCount = Math.round(450 * (terrainSize * terrainSize) / (100 * 100));
export const treePlacementThreshold = grassLevel + 1.5;
export const treePlacementDensity = 0.045;
export const minTreeDist = 1.5;
export const trunkHeight = 2.5;
export const trunkRadius = 0.2;
export const leavesHeight = 2.0;
export const leavesRadius = 1.0;


export const playerHeight = 1.8;
export const playerRadius = 0.4;
export const playerSpeed = 5.0;
export const jumpStrength = 7.0;
export const gravity = -20.0;
export const firstPersonEyeHeight = playerHeight * 0.9;


export const initialCameraMode = 'third-person';
export const thirdPersonOffset = { x: 0, y: 5, z: 10 };


export const fogNear = 50 * (terrainSize / 100);
export const fogFar = 500 * (terrainSize / 100);
export const shadowMapSize = 2048;
