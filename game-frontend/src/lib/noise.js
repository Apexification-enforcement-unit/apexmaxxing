import { createNoise3D as createNoise } from 'simplex-noise';

export let noise3D = null;
export let noise3D_lowFreq = null;
export let noise3D_region = null;

export function createSeededRandom(seed) {
    let hash = 0;
    if (typeof seed !== 'string') seed = String(seed); 
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; 
    }

    let state = hash === 0 ? 1 : hash; 
    return () => {
        
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function setupNoiseFunctions(receivedSeed) {
    if (!receivedSeed) {
        console.error("[noise] No seed");
        return;
    }
    const randomHighFreq = createSeededRandom(receivedSeed);
    const randomLowFreq = createSeededRandom(receivedSeed + "-low");
    const randomRegion = createSeededRandom(receivedSeed + "-region");

    noise3D = createNoise(randomHighFreq);
    noise3D_lowFreq = createNoise(randomLowFreq);
    noise3D_region = createNoise(randomRegion);

    console.log("Seed is ok");
}

export const createNoise3D = createNoise;
