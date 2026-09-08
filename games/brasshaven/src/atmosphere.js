import * as THREE from "three";

export function createAtmosphere(scene, sources) {
  const time = { value: 0 };
  // Analytic soft particles; no sprite images or external textures.
  const count = 180,
    positions = new Float32Array(count * 3),
    origins = new Float32Array(count * 3),
    seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = sources[i % sources.length] || [0, 10, -7];
    origins.set(o, i * 3);
    seeds[i] = i * 1.618;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aOrigin", new THREE.BufferAttribute(origins, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const steamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: time, uScale: { value: 1 } },
    vertexShader: `uniform float uTime;uniform float uScale;attribute vec3 aOrigin;attribute float aSeed;varying float vAge;varying float vSeed;void main(){float age=mod(uTime*.13+aSeed,1.);vAge=age;vSeed=aSeed;vec3 p=aOrigin+vec3(sin(aSeed*7.+age*2.)*.3+age*2.6,age*5.,cos(aSeed*8.+age*2.)*.35+age*.65);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(18.+age*95.)*uScale;}`,
    fragmentShader: `varying float vAge;varying float vSeed;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);float a=exp(-r*r*14.)*(1.-smoothstep(.32,.5,r));float detail=sin(p.x*26.+vSeed)*sin(p.y*23.+vSeed)*.12+.88;a*=detail*sin(vAge*3.14159)*.17;gl_FragColor=vec4(mix(vec3(.8,.87,.87),vec3(.99,.98,.91),1.-vAge),a);}`,
  });
  const steam = new THREE.Points(geometry, steamMat);
  steam.frustumCulled = false;
  steam.renderOrder = 3;
  scene.add(steam);
  const emberCount = 100,
    emberPos = new Float32Array(emberCount * 3),
    emberSeed = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) {
    emberPos.set(
      [(Math.random() - 0.5) * 40, Math.random() * 15, Math.random() * 30 - 15],
      i * 3,
    );
    emberSeed[i] = Math.random() * 10;
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  eg.setAttribute("aSeed", new THREE.BufferAttribute(emberSeed, 1));
  const em = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: time },
    vertexShader: `uniform float uTime;attribute float aSeed;varying float vAlpha;void main(){vec3 p=position;p.x+=sin(uTime*.17+aSeed)*1.3;p.y=mod(p.y+uTime*(.15+aSeed*.03),16.);p.z+=cos(uTime*.13+aSeed);vAlpha=.25+.75*pow(sin(uTime*.7+aSeed),2.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=2.+sin(aSeed)*.7;}`,
    fragmentShader: `varying float vAlpha;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(1.,.55,.17,a*vAlpha*.8);}`,
  });
  const embers = new THREE.Points(eg, em);
  embers.frustumCulled = false;
  scene.add(embers);
  // Fine rainfall remaining on the edge of the passing shower.
  const rainCount = 190,
    rainPositions = new Float32Array(rainCount * 6),
    rainTips = new Float32Array(rainCount * 2);
  for (let i = 0; i < rainCount; i++) {
    const x = Math.random() * 55 - 27.5,
      y = Math.random() * 19,
      z = Math.random() * 45 - 22;
    // Both vertices wrap together; wrapping the tip separately creates 19 m flashes.
    rainPositions.set([x, y, z, x, y, z], i * 6);
    rainTips[i * 2 + 1] = 1;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  rg.setAttribute("aTip", new THREE.BufferAttribute(rainTips, 1));
  const rm = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: time },
    vertexShader: `uniform float uTime;attribute float aTip;void main(){vec3 p=position;p.y=mod(p.y-uTime*5.,19.);p+=vec3(-.04,.22,0.)*aTip;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `void main(){gl_FragColor=vec4(.38,.6,.64,.12);}`,
  });
  const rain = new THREE.LineSegments(rg, rm);
  rain.frustumCulled = false;
  scene.add(rain);
  return {
    update(t) {
      time.value = t;
    },
    resize(height, viewHeight) {
      steamMat.uniforms.uScale.value = height / viewHeight / 29;
    },
  };
}

export function createSound() {
  let context, gain;
  return async function setSound(enabled) {
    if (!context && enabled) {
      context = new AudioContext();
      gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      const buffer = context.createBuffer(
          1,
          context.sampleRate * 4,
          context.sampleRate,
        ),
        data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + Math.random() * 0.04 - 0.02) / 1.02;
        data[i] = brown * 2;
      }
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 480;
      noise.connect(filter);
      filter.connect(gain);
      noise.start();
      for (const f of [55, 82.4, 110]) {
        const o = context.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = context.createGain();
        g.gain.value = 0.018;
        o.connect(g);
        g.connect(gain);
        o.start();
      }
    }
    if (context) {
      await context.resume();
      gain.gain.setTargetAtTime(enabled ? 0.45 : 0, context.currentTime, 0.6);
    }
  };
}
