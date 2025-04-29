import * as THREE from 'three';
import * as config from './config.js';
import { browser } from '$app/environment';

export let terrainMaterial = null;
export let waterMaterial = null;
export let trunkMaterial = null;
export let leavesMaterial = null;
export let playerMaterial = null;

let textureLoader = null;
let grassTextures = [];
let stoneTextures = [];
let allTextures = [];
let materialsInitialized = false;

export function initializeMaterials() {
	if (!browser || materialsInitialized) {
		return;
	}

	console.log('Textures shall be loaded');
	textureLoader = new THREE.TextureLoader();
	const grassBasePath = '/assets/grass0/';
	// const stoneBasePath = '/assets/stone0/';

	const grassBaseColor = textureLoader.load(grassBasePath + '4K_BaseColor.jpg');
	const grassNormalMap = textureLoader.load(grassBasePath + '4K_Normal.jpg');
	const grassRoughnessMap = textureLoader.load(grassBasePath + '4K_Roughness.jpg');
	const grassAOMap = textureLoader.load(grassBasePath + '4K_AO.jpg');
	const grassDisplacementMap = textureLoader.load(grassBasePath + '4K_Displacement.jpg');

	//const stoneBaseColor = textureLoader.load(stoneBasePath + '4K_BaseColor.jpg');
	//const stoneNormalMap = textureLoader.load(stoneBasePath + '4K_Normal.jpg');
	//const stoneRoughnessMap = textureLoader.load(stoneBasePath + '4K_Roughness.jpg');
	//const stoneAOMap = textureLoader.load(stoneBasePath + '4K_AO.jpg');

	grassTextures = [grassBaseColor, grassNormalMap, grassRoughnessMap, grassAOMap, grassDisplacementMap];
	//stoneTextures = [stoneBaseColor, stoneNormalMap, stoneRoughnessMap, stoneAOMap];
	allTextures = [...grassTextures];

	allTextures.forEach((texture) => {
		if (texture) {
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;
			texture.repeat.set(config.textureRepeat, config.textureRepeat);
			texture.needsUpdate = true;
		}
	});

	terrainMaterial = new THREE.MeshStandardMaterial({
		side: THREE.DoubleSide,
		metalness: 0.1,
		roughness: 0.8,
		displacementMap: grassDisplacementMap,
		displacementScale: 0.4,
		aoMapIntensity: 1.0,
		normalScale: new THREE.Vector2(1, 1)
	});

	const terrainUniforms = {
		stoneMap: { value: stoneBaseColor },
		stoneNormalMap: { value: stoneNormalMap },
		stoneRoughnessMap: { value: stoneRoughnessMap },
		stoneAOMap: { value: stoneAOMap },
		grassMap: { value: grassBaseColor },
		grassNormalMap: { value: grassNormalMap },
		grassRoughnessMap: { value: grassRoughnessMap },
		grassAOMap: { value: grassAOMap }
	};

	terrainMaterial.onBeforeCompile = (shader) => {
		shader.vertexShader =
			`
            attribute float materialBlend;
            varying float vMaterialBlend;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
        ` + shader.vertexShader;

		shader.vertexShader = shader.vertexShader.replace(
			'#include <uv_vertex>',
			`#include <uv_vertex>
            vUv = uv;
            `
		);
		shader.vertexShader = shader.vertexShader.replace(
			'#include <worldpos_vertex>',
			`#include <worldpos_vertex>
             vWorldPosition = worldPosition.xyz;
             `
		);
		shader.vertexShader = shader.vertexShader.replace(
			'#include <normal_vertex>',
			`#include <normal_vertex>
             vNormal = normalize( transformedNormal );
             `
		);
		shader.vertexShader = shader.vertexShader.replace(
			'#include <fog_vertex>',
			`#include <fog_vertex>
            vMaterialBlend = materialBlend;
            `
		);

		shader.fragmentShader =
			`
            uniform sampler2D stoneMap;
            uniform sampler2D stoneNormalMap;
            uniform sampler2D stoneRoughnessMap;
            uniform sampler2D stoneAOMap;
            uniform sampler2D grassMap;
            uniform sampler2D grassNormalMap;
            uniform sampler2D grassRoughnessMap;
            uniform sampler2D grassAOMap;

            varying float vMaterialBlend;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
        ` + shader.fragmentShader;

		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <map_fragment>',
			`
            #if defined( USE_MAP ) || defined( USE_ALPHAMAP )
                vec4 grassTexelColor = texture2D( grassMap, vUv );
                vec4 stoneTexelColor = texture2D( stoneMap, vUv );
                vec4 blendedTexelColor = mix(grassTexelColor, stoneTexelColor, vMaterialBlend);

                #ifdef USE_MAP

                    blendedTexelColor = mapTexelToLinear( blendedTexelColor );
                    diffuseColor *= blendedTexelColor;
                #endif
                #ifdef USE_ALPHAMAP
                    diffuseColor.a *= blendedTexelColor.r;
                #endif
            #endif
            `
		);

		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <roughnessmap_fragment>',
			`
            float roughnessFactor = roughness;
            #ifdef USE_ROUGHNESSMAP
                vec4 grassRoughnessTexel = texture2D( grassRoughnessMap, vUv );
                vec4 stoneRoughnessTexel = texture2D( stoneRoughnessMap, vUv );

                float blendedRoughness = mix(grassRoughnessTexel.g, stoneRoughnessTexel.g, vMaterialBlend);
                roughnessFactor *= blendedRoughness;
            #else
                 vec4 grassRoughnessTexel = texture2D( grassRoughnessMap, vUv );
                 vec4 stoneRoughnessTexel = texture2D( stoneRoughnessMap, vUv );
                 float blendedRoughness = mix(grassRoughnessTexel.g, stoneRoughnessTexel.g, vMaterialBlend);
                 roughnessFactor = blendedRoughness;
            #endif
            `
		);

		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <metalnessmap_fragment>',
			`
            float metalnessFactor = metalness;


            `
		);

		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <normal_fragment_maps>',
			`
            #ifdef OBJECTSPACE_NORMALMAP

                vec3 grassNormalOS = texture2D( grassNormalMap, vUv ).xyz * 2.0 - 1.0;
                vec3 stoneNormalOS = texture2D( stoneNormalMap, vUv ).xyz * 2.0 - 1.0;
                normal = normalize(mix(grassNormalOS, stoneNormalOS, vMaterialBlend));
            #else
                vec3 mapN_grass = texture2D( grassNormalMap, vUv ).xyz * 2.0 - 1.0;
                vec3 mapN_stone = texture2D( stoneNormalMap, vUv ).xyz * 2.0 - 1.0;
                vec3 mapN = normalize(mix(mapN_grass, mapN_stone, vMaterialBlend));

                #ifdef USE_TANGENT

                    normal = normalize( vTBN * mapN );
                #else

                    normal = perturbNormal2Arb( -vViewPosition, normal, mapN, faceDirection );
                #endif
            #endif


            #if defined( USE_NORMALMAP_OBJECTSPACE ) || defined( USE_NORMALMAP_TANGENTSPACE )
                 normal = normalize( normal );
            #endif
            `
		);

		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <aomap_fragment>',
			`
            float ambientOcclusion = 1.0;
            #ifdef USE_AOMAP
                vec4 grassAoTexel = texture2D( grassAOMap, vUv );
                vec4 stoneAoTexel = texture2D( stoneAOMap, vUv );

                float blendedAo = mix(grassAoTexel.r, stoneAoTexel.r, vMaterialBlend);
                ambientOcclusion *= blendedAo;
            #else
                 vec4 grassAoTexel = texture2D( grassAOMap, vUv );
                 vec4 stoneAoTexel = texture2D( stoneAOMap, vUv );
                 float blendedAo = mix(grassAoTexel.r, stoneAoTexel.r, vMaterialBlend);
                 ambientOcclusion = blendedAo;
            #endif


            reflectedLight.indirectDiffuse *= ambientOcclusion;


            #if defined( USE_ENVMAP ) && defined( STANDARD )
                 float dotNV = saturate( dot( geometryNormal, normal ) );
                 reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, roughnessFactor );
            #endif
            `
		);

		shader.uniforms = { ...shader.uniforms, ...terrainUniforms };
		terrainMaterial.userData.shader = shader;
	};

	waterMaterial = new THREE.MeshStandardMaterial({
		color: 0x4682b4,
		metalness: 0.6,
		roughness: 0.2,
		transparent: true,
		opacity: 0.85
	});
	trunkMaterial = new THREE.MeshStandardMaterial({ color: '#8B4513' });
	leavesMaterial = new THREE.MeshStandardMaterial({ color: '#2E8B57' });
	playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5 });

	materialsInitialized = true;
	console.log('Materials initialized.');
}

export function disposeSharedMaterials() {
	if (!materialsInitialized || !browser) return;
	console.log('Disposing shared materials and textures...');
	allTextures.forEach((texture) => texture?.dispose());
	terrainMaterial?.dispose();
	waterMaterial?.dispose();
	trunkMaterial?.dispose();
	leavesMaterial?.dispose();
	playerMaterial?.dispose();

	terrainMaterial = null;
	waterMaterial = null;
	trunkMaterial = null;
	leavesMaterial = null;
	playerMaterial = null;
	textureLoader = null;
	grassTextures = [];
	stoneTextures = [];
	allTextures = [];
	materialsInitialized = false;
	console.log('Shared materials disposed.');
}
