import { Camera, DepthTexture, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UnsignedShortType, Vector2, WebGLRenderTarget, WebGLRenderer } from "three";
import type { PrevisCamera } from "@/types/previs";
import { previsLens } from "@/lib/canvas/previs/previs-lens";

// One colour/depth pass and one bounded 41-tap lens pass. Both the CAM view and
// fixed-clock exports use this implementation; helper passes stay unblurred.
export class PrevisDepthOfField {
    private target = new WebGLRenderTarget(1, 1);
    private material = new ShaderMaterial({
        uniforms: { colour: { value: this.target.texture }, depth: { value: null }, resolution: { value: new Vector2(1, 1) }, near: { value: 0.1 }, far: { value: 200 }, focus: { value: 5 }, coefficient: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
        fragmentShader: `
            uniform sampler2D colour,depth;
            uniform vec2 resolution;
            uniform float near,far,focus,coefficient;
            varying vec2 vUv;
            float distanceAt(vec2 uv){float z=texture2D(depth,uv).x;return near*far/(far-z*(far-near));}
            float radiusAt(float z){return min(24.,resolution.y*coefficient*abs((z-focus)/max(z,.001))*.5);}
            void main(){
                float centerDepth=distanceAt(vUv),radius=radiusAt(centerDepth);
                vec4 sum=texture2D(colour,vUv);float weight=1.;
                for(int i=1;i<=40;i++){
                    float r=sqrt(float(i)/40.),a=float(i)*2.39996323;
                    vec2 uv=vUv+vec2(cos(a),sin(a))*r*radius/resolution;
                    float z=distanceAt(uv);
                    // A sharp foreground edge must not receive distant background colour.
                    float w=(z>centerDepth+.1&&radiusAt(z)>radius+1.)?.15:1.;
                    sum+=texture2D(colour,clamp(uv,vec2(0.),vec2(1.)))*w;weight+=w;
                }
                gl_FragColor=sum/weight;
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`,
        depthTest: false,
        depthWrite: false,
    });
    private geometry = new PlaneGeometry(2, 2);
    private screen = new Scene();
    private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    constructor() {
        this.target.depthTexture = new DepthTexture(1, 1, UnsignedShortType);
        this.material.uniforms.depth.value = this.target.depthTexture;
        this.screen.add(new Mesh(this.geometry, this.material));
    }
    render(renderer: WebGLRenderer, scene: Scene, camera: Camera & { near: number; far: number }, lens: PrevisCamera, width: number, height: number) {
        const optical = previsLens(lens);
        if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
        const uniforms = this.material.uniforms;
        uniforms.resolution.value.set(width, height);
        uniforms.near.value = camera.near;
        uniforms.far.value = camera.far;
        uniforms.focus.value = optical.focus;
        uniforms.coefficient.value = optical.coefficient;
        const previous = renderer.getRenderTarget();
        try {
            renderer.setRenderTarget(this.target);
            renderer.render(scene, camera);
            renderer.setRenderTarget(previous);
            renderer.render(this.screen, this.camera);
        } finally {
            renderer.setRenderTarget(previous);
        }
    }
    dispose() {
        this.target.depthTexture?.dispose();
        this.target.dispose();
        this.material.dispose();
        this.geometry.dispose();
        this.screen.clear();
    }
}
