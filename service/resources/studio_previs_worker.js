(()=>{var Su;function K(e,t,n){function i(a,c){if(!a._zod)Object.defineProperty(a,"_zod",{value:{def:c,constr:o,traits:new Set},enumerable:!1});if(a._zod.traits.has(e))return;a._zod.traits.add(e),t(a,c);let l=o.prototype,u=Object.keys(l);for(let d=0;d<u.length;d++){let h=u[d];if(!(h in a))a[h]=l[h].bind(a)}}let r=n?.Parent??Object;class s extends r{}Object.defineProperty(s,"name",{value:e});function o(a){var c;let l=n?.Parent?new s:this;i(l,a),(c=l._zod).deferred??(c.deferred=[]);for(let u of l._zod.deferred)u();return l}return Object.defineProperty(o,"init",{value:i}),Object.defineProperty(o,Symbol.hasInstance,{value:(a)=>{if(n?.Parent&&a instanceof n.Parent)return!0;return a?._zod?.traits?.has(e)}}),Object.defineProperty(o,"name",{value:e}),o}var YM=Symbol("zod_brand");class Xn extends Error{constructor(){super("Encountered Promise during synchronous parse. Use .parseAsync() instead.")}}class Hr extends Error{constructor(e){super(`Encountered unidirectional transform during encode: ${e}`);this.name="ZodEncodeError"}}(Su=globalThis).__zod_globalConfig??(Su.__zod_globalConfig={});var sr=globalThis.__zod_globalConfig;function qn(e){if(e)Object.assign(sr,e);return sr}function zs(e){let t=Object.values(e).filter((i)=>typeof i==="number");return Object.entries(e).filter(([i,r])=>t.indexOf(+i)===-1).map(([i,r])=>r)}function Wr(e,t){if(typeof t==="bigint")return t.toString();return t}function ks(e){return{get value(){{let n=e();return Object.defineProperty(this,"value",{value:n}),n}throw Error("cached value already set")}}}function Bs(e){return e===null||e===void 0}function Gs(e){let t=e.startsWith("^")?1:0,n=e.endsWith("$")?e.length-1:e.length;return e.slice(t,n)}function Mu(e,t){let n=e/t,i=Math.round(n),r=Number.EPSILON*Math.max(Math.abs(n),1);if(Math.abs(n-i)<r)return 0;return n-i}var bu=Symbol("evaluating");function rt(e,t,n){let i=void 0;Object.defineProperty(e,t,{get(){if(i===bu)return;if(i===void 0)i=bu,i=n();return i},set(r){Object.defineProperty(e,t,{value:r})},configurable:!0})}function Ni(e,t,n){Object.defineProperty(e,t,{value:n,writable:!0,enumerable:!0,configurable:!0})}function hi(...e){let t={};for(let n of e){let i=Object.getOwnPropertyDescriptors(n);Object.assign(t,i)}return Object.defineProperties({},t)}function ya(e){return JSON.stringify(e)}function wu(e){return e.toLowerCase().trim().replace(/[^\w\s-]/g,"").replace(/[\s_-]+/g,"-").replace(/^-+|-+$/g,"")}var Sa="captureStackTrace"in Error?Error.captureStackTrace:(...e)=>{};function Vr(e){return typeof e==="object"&&e!==null&&!Array.isArray(e)}var Tu=ks(()=>{if(sr.jitless)return!1;if(typeof navigator<"u"&&navigator?.userAgent?.includes("Cloudflare"))return!1;try{return new Function(""),!0}catch(e){return!1}});function or(e){if(Vr(e)===!1)return!1;let t=e.constructor;if(t===void 0)return!0;if(typeof t!=="function")return!0;let n=t.prototype;if(Vr(n)===!1)return!1;if(Object.prototype.hasOwnProperty.call(n,"isPrototypeOf")===!1)return!1;return!0}function ba(e){if(or(e))return{...e};if(Array.isArray(e))return[...e];if(e instanceof Map)return new Map(e);if(e instanceof Set)return new Set(e);return e}var Eu=new Set(["string","number","symbol"]);function ar(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function In(e,t,n){let i=new e._zod.constr(t??e._zod.def);if(!t||n?.parent)i._zod.parent=e;return i}function Ae(e){let t=e;if(!t)return{};if(typeof t==="string")return{error:()=>t};if(t?.message!==void 0){if(t?.error!==void 0)throw Error("Cannot specify both `message` and `error` params");t.error=t.message}if(delete t.message,typeof t.error==="string")return{...t,error:()=>t.error};return t}function Au(e){return Object.keys(e).filter((t)=>e[t]._zod.optin==="optional"&&e[t]._zod.optout==="optional")}var Ru={safeint:[Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER],int32:[-2147483648,2147483647],uint32:[0,4294967295],float32:[-340282346638528860000000000000000000000,340282346638528860000000000000000000000],float64:[-Number.MAX_VALUE,Number.MAX_VALUE]};function b_(e,t){let n=e._zod.def,i=n.checks;if(i&&i.length>0)throw Error(".pick() cannot be used on object schemas containing refinements");let s=hi(e._zod.def,{get shape(){let o={};for(let a in t){if(!(a in n.shape))throw Error(`Unrecognized key: "${a}"`);if(!t[a])continue;o[a]=n.shape[a]}return Ni(this,"shape",o),o},checks:[]});return In(e,s)}function M_(e,t){let n=e._zod.def,i=n.checks;if(i&&i.length>0)throw Error(".omit() cannot be used on object schemas containing refinements");let s=hi(e._zod.def,{get shape(){let o={...e._zod.def.shape};for(let a in t){if(!(a in n.shape))throw Error(`Unrecognized key: "${a}"`);if(!t[a])continue;delete o[a]}return Ni(this,"shape",o),o},checks:[]});return In(e,s)}function w_(e,t){if(!or(t))throw Error("Invalid input to extend: expected a plain object");let n=e._zod.def.checks;if(n&&n.length>0){let s=e._zod.def.shape;for(let o in t)if(Object.getOwnPropertyDescriptor(s,o)!==void 0)throw Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.")}let r=hi(e._zod.def,{get shape(){let s={...e._zod.def.shape,...t};return Ni(this,"shape",s),s}});return In(e,r)}function T_(e,t){if(!or(t))throw Error("Invalid input to safeExtend: expected a plain object");let n=hi(e._zod.def,{get shape(){let i={...e._zod.def.shape,...t};return Ni(this,"shape",i),i}});return In(e,n)}function E_(e,t){if(e._zod.def.checks?.length)throw Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");let n=hi(e._zod.def,{get shape(){let i={...e._zod.def.shape,...t._zod.def.shape};return Ni(this,"shape",i),i},get catchall(){return t._zod.def.catchall},checks:t._zod.def.checks??[]});return In(e,n)}function A_(e,t,n){let r=t._zod.def.checks;if(r&&r.length>0)throw Error(".partial() cannot be used on object schemas containing refinements");let o=hi(t._zod.def,{get shape(){let a=t._zod.def.shape,c={...a};if(n)for(let l in n){if(!(l in a))throw Error(`Unrecognized key: "${l}"`);if(!n[l])continue;c[l]=e?new e({type:"optional",innerType:a[l]}):a[l]}else for(let l in a)c[l]=e?new e({type:"optional",innerType:a[l]}):a[l];return Ni(this,"shape",c),c},checks:[]});return In(t,o)}function R_(e,t,n){let i=hi(t._zod.def,{get shape(){let r=t._zod.def.shape,s={...r};if(n)for(let o in n){if(!(o in s))throw Error(`Unrecognized key: "${o}"`);if(!n[o])continue;s[o]=new e({type:"nonoptional",innerType:r[o]})}else for(let o in r)s[o]=new e({type:"nonoptional",innerType:r[o]});return Ni(this,"shape",s),s}});return In(t,i)}function Di(e,t=0){if(e.aborted===!0)return!0;for(let n=t;n<e.issues.length;n++)if(e.issues[n]?.continue!==!0)return!0;return!1}function Cu(e,t=0){if(e.aborted===!0)return!0;for(let n=t;n<e.issues.length;n++)if(e.issues[n]?.continue===!1)return!0;return!1}function Hs(e,t){return t.map((n)=>{var i;return(i=n).path??(i.path=[]),n.path.unshift(e),n})}function Fs(e){return typeof e==="string"?e:e?.message}function Yn(e,t,n){let i=e.message?e.message:Fs(e.inst?._zod.def?.error?.(e))??Fs(t?.error?.(e))??Fs(n.customError?.(e))??Fs(n.localeError?.(e))??"Invalid input",{inst:r,continue:s,input:o,...a}=e;if(a.path??(a.path=[]),a.message=i,t?.reportInput)a.input=o;return a}function Vs(e){if(Array.isArray(e))return"array";if(typeof e==="string")return"string";return"unknown"}function Ui(...e){let[t,n,i]=e;if(typeof t==="string")return{message:t,code:"custom",input:n,inst:i};return{...t}}var Iu=(e,t)=>{e.name="$ZodError",Object.defineProperty(e,"_zod",{value:e._zod,enumerable:!1}),Object.defineProperty(e,"issues",{value:t,enumerable:!1}),e.message=JSON.stringify(t,Wr,2),Object.defineProperty(e,"toString",{value:()=>e.message,enumerable:!1})},Ws=K("$ZodError",Iu),Ma=K("$ZodError",Iu,{Parent:Error});function Pu(e,t=(n)=>n.message){let n={},i=[];for(let r of e.issues)if(r.path.length>0)n[r.path[0]]=n[r.path[0]]||[],n[r.path[0]].push(t(r));else i.push(t(r));return{formErrors:i,fieldErrors:n}}function Lu(e,t=(n)=>n.message){let n={_errors:[]},i=(r,s=[])=>{for(let o of r.issues)if(o.code==="invalid_union"&&o.errors.length)o.errors.map((a)=>i({issues:a},[...s,...o.path]));else if(o.code==="invalid_key")i({issues:o.issues},[...s,...o.path]);else if(o.code==="invalid_element")i({issues:o.issues},[...s,...o.path]);else{let a=[...s,...o.path];if(a.length===0)n._errors.push(t(o));else{let c=n,l=0;while(l<a.length){let u=a[l];if(l!==a.length-1)c[u]=c[u]||{_errors:[]};else c[u]=c[u]||{_errors:[]},c[u]._errors.push(t(o));c=c[u],l++}}}};return i(e),n}var $s=(e)=>(t,n,i,r)=>{let s=i?{...i,async:!1}:{async:!1},o=t._zod.run({value:n,issues:[]},s);if(o instanceof Promise)throw new Xn;if(o.issues.length){let a=new(r?.Err??e)(o.issues.map((c)=>Yn(c,s,qn())));throw Sa(a,r?.callee),a}return o.value};var Zs=(e)=>async(t,n,i,r)=>{let s=i?{...i,async:!0}:{async:!0},o=t._zod.run({value:n,issues:[]},s);if(o instanceof Promise)o=await o;if(o.issues.length){let a=new(r?.Err??e)(o.issues.map((c)=>Yn(c,s,qn())));throw Sa(a,r?.callee),a}return o.value};var $r=(e)=>(t,n,i)=>{let r=i?{...i,async:!1}:{async:!1},s=t._zod.run({value:n,issues:[]},r);if(s instanceof Promise)throw new Xn;return s.issues.length?{success:!1,error:new(e??Ws)(s.issues.map((o)=>Yn(o,r,qn())))}:{success:!0,data:s.value}},Nu=$r(Ma),Zr=(e)=>async(t,n,i)=>{let r=i?{...i,async:!0}:{async:!0},s=t._zod.run({value:n,issues:[]},r);if(s instanceof Promise)s=await s;return s.issues.length?{success:!1,error:new e(s.issues.map((o)=>Yn(o,r,qn())))}:{success:!0,data:s.value}},Du=Zr(Ma),Uu=(e)=>(t,n,i)=>{let r=i?{...i,direction:"backward"}:{direction:"backward"};return $s(e)(t,n,r)};var Ou=(e)=>(t,n,i)=>$s(e)(t,n,i);var Fu=(e)=>async(t,n,i)=>{let r=i?{...i,direction:"backward"}:{direction:"backward"};return Zs(e)(t,n,r)};var zu=(e)=>async(t,n,i)=>Zs(e)(t,n,i);var ku=(e)=>(t,n,i)=>{let r=i?{...i,direction:"backward"}:{direction:"backward"};return $r(e)(t,n,r)};var Bu=(e)=>(t,n,i)=>$r(e)(t,n,i);var Gu=(e)=>async(t,n,i)=>{let r=i?{...i,direction:"backward"}:{direction:"backward"};return Zr(e)(t,n,r)};var Hu=(e)=>async(t,n,i)=>Zr(e)(t,n,i);var Vu=/^[cC][0-9a-z]{6,}$/,Wu=/^[0-9a-z]+$/,$u=/^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/,Zu=/^[0-9a-vA-V]{20}$/,Xu=/^[A-Za-z0-9]{27}$/,qu=/^[a-zA-Z0-9_-]{21}$/,Yu=/^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;var Ju=/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,wa=(e)=>{if(!e)return/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`)};var Ku=/^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;var I_="^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";function ju(){return new RegExp(I_,"u")}var Qu=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,eh=/^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;var th=/^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/,nh=/^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,ih=/^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/,Ta=/^[A-Za-z0-9_-]*$/;var rh=/^https?$/,sh=/^\+[1-9]\d{6,14}$/,oh="(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))",ah=new RegExp(`^${oh}$`);function ch(e){return typeof e.precision==="number"?e.precision===-1?"(?:[01]\\d|2[0-3]):[0-5]\\d":e.precision===0?"(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d":`(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{${e.precision}}`:"(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?"}function lh(e){return new RegExp(`^${ch(e)}$`)}function uh(e){let t=ch({precision:e.precision}),n=["Z"];if(e.local)n.push("");if(e.offset)n.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");let i=`${t}(?:${n.join("|")})`;return new RegExp(`^${oh}T(?:${i})$`)}var hh=(e)=>{let t=e?`[\\s\\S]{${e?.minimum??0},${e?.maximum??""}}`:"[\\s\\S]*";return new RegExp(`^${t}$`)};var dh=/^-?\d+$/,fh=/^-?\d+(?:\.\d+)?$/,ph=/^(?:true|false)$/i;var mh=/^[^A-Z]*$/,gh=/^[^a-z]*$/;var Bt=K("$ZodCheck",(e,t)=>{var n;e._zod??(e._zod={}),e._zod.def=t,(n=e._zod).onattach??(n.onattach=[])}),_h={number:"number",bigint:"bigint",object:"date"},Ea=K("$ZodCheckLessThan",(e,t)=>{Bt.init(e,t);let n=_h[typeof t.value];e._zod.onattach.push((i)=>{let r=i._zod.bag,s=(t.inclusive?r.maximum:r.exclusiveMaximum)??Number.POSITIVE_INFINITY;if(t.value<s)if(t.inclusive)r.maximum=t.value;else r.exclusiveMaximum=t.value}),e._zod.check=(i)=>{if(t.inclusive?i.value<=t.value:i.value<t.value)return;i.issues.push({origin:n,code:"too_big",maximum:typeof t.value==="object"?t.value.getTime():t.value,input:i.value,inclusive:t.inclusive,inst:e,continue:!t.abort})}}),Aa=K("$ZodCheckGreaterThan",(e,t)=>{Bt.init(e,t);let n=_h[typeof t.value];e._zod.onattach.push((i)=>{let r=i._zod.bag,s=(t.inclusive?r.minimum:r.exclusiveMinimum)??Number.NEGATIVE_INFINITY;if(t.value>s)if(t.inclusive)r.minimum=t.value;else r.exclusiveMinimum=t.value}),e._zod.check=(i)=>{if(t.inclusive?i.value>=t.value:i.value>t.value)return;i.issues.push({origin:n,code:"too_small",minimum:typeof t.value==="object"?t.value.getTime():t.value,input:i.value,inclusive:t.inclusive,inst:e,continue:!t.abort})}}),xh=K("$ZodCheckMultipleOf",(e,t)=>{Bt.init(e,t),e._zod.onattach.push((n)=>{var i;(i=n._zod.bag).multipleOf??(i.multipleOf=t.value)}),e._zod.check=(n)=>{if(typeof n.value!==typeof t.value)throw Error("Cannot mix number and bigint in multiple_of check.");if(typeof n.value==="bigint"?n.value%t.value===BigInt(0):Mu(n.value,t.value)===0)return;n.issues.push({origin:typeof n.value,code:"not_multiple_of",divisor:t.value,input:n.value,inst:e,continue:!t.abort})}}),vh=K("$ZodCheckNumberFormat",(e,t)=>{Bt.init(e,t),t.format=t.format||"float64";let n=t.format?.includes("int"),i=n?"int":"number",[r,s]=Ru[t.format];e._zod.onattach.push((o)=>{let a=o._zod.bag;if(a.format=t.format,a.minimum=r,a.maximum=s,n)a.pattern=dh}),e._zod.check=(o)=>{let a=o.value;if(n){if(!Number.isInteger(a)){o.issues.push({expected:i,format:t.format,code:"invalid_type",continue:!1,input:a,inst:e});return}if(!Number.isSafeInteger(a)){if(a>0)o.issues.push({input:a,code:"too_big",maximum:Number.MAX_SAFE_INTEGER,note:"Integers must be within the safe integer range.",inst:e,origin:i,inclusive:!0,continue:!t.abort});else o.issues.push({input:a,code:"too_small",minimum:Number.MIN_SAFE_INTEGER,note:"Integers must be within the safe integer range.",inst:e,origin:i,inclusive:!0,continue:!t.abort});return}}if(a<r)o.issues.push({origin:"number",input:a,code:"too_small",minimum:r,inclusive:!0,inst:e,continue:!t.abort});if(a>s)o.issues.push({origin:"number",input:a,code:"too_big",maximum:s,inclusive:!0,inst:e,continue:!t.abort})}});var yh=K("$ZodCheckMaxLength",(e,t)=>{var n;Bt.init(e,t),(n=e._zod.def).when??(n.when=(i)=>{let r=i.value;return!Bs(r)&&r.length!==void 0}),e._zod.onattach.push((i)=>{let r=i._zod.bag.maximum??Number.POSITIVE_INFINITY;if(t.maximum<r)i._zod.bag.maximum=t.maximum}),e._zod.check=(i)=>{let r=i.value;if(r.length<=t.maximum)return;let o=Vs(r);i.issues.push({origin:o,code:"too_big",maximum:t.maximum,inclusive:!0,input:r,inst:e,continue:!t.abort})}}),Sh=K("$ZodCheckMinLength",(e,t)=>{var n;Bt.init(e,t),(n=e._zod.def).when??(n.when=(i)=>{let r=i.value;return!Bs(r)&&r.length!==void 0}),e._zod.onattach.push((i)=>{let r=i._zod.bag.minimum??Number.NEGATIVE_INFINITY;if(t.minimum>r)i._zod.bag.minimum=t.minimum}),e._zod.check=(i)=>{let r=i.value;if(r.length>=t.minimum)return;let o=Vs(r);i.issues.push({origin:o,code:"too_small",minimum:t.minimum,inclusive:!0,input:r,inst:e,continue:!t.abort})}}),bh=K("$ZodCheckLengthEquals",(e,t)=>{var n;Bt.init(e,t),(n=e._zod.def).when??(n.when=(i)=>{let r=i.value;return!Bs(r)&&r.length!==void 0}),e._zod.onattach.push((i)=>{let r=i._zod.bag;r.minimum=t.length,r.maximum=t.length,r.length=t.length}),e._zod.check=(i)=>{let r=i.value,s=r.length;if(s===t.length)return;let o=Vs(r),a=s>t.length;i.issues.push({origin:o,...a?{code:"too_big",maximum:t.length}:{code:"too_small",minimum:t.length},inclusive:!0,exact:!0,input:i.value,inst:e,continue:!t.abort})}}),Xr=K("$ZodCheckStringFormat",(e,t)=>{var n,i;if(Bt.init(e,t),e._zod.onattach.push((r)=>{let s=r._zod.bag;if(s.format=t.format,t.pattern)s.patterns??(s.patterns=new Set),s.patterns.add(t.pattern)}),t.pattern)(n=e._zod).check??(n.check=(r)=>{if(t.pattern.lastIndex=0,t.pattern.test(r.value))return;r.issues.push({origin:"string",code:"invalid_format",format:t.format,input:r.value,...t.pattern?{pattern:t.pattern.toString()}:{},inst:e,continue:!t.abort})});else(i=e._zod).check??(i.check=()=>{})}),Mh=K("$ZodCheckRegex",(e,t)=>{Xr.init(e,t),e._zod.check=(n)=>{if(t.pattern.lastIndex=0,t.pattern.test(n.value))return;n.issues.push({origin:"string",code:"invalid_format",format:"regex",input:n.value,pattern:t.pattern.toString(),inst:e,continue:!t.abort})}}),wh=K("$ZodCheckLowerCase",(e,t)=>{t.pattern??(t.pattern=mh),Xr.init(e,t)}),Th=K("$ZodCheckUpperCase",(e,t)=>{t.pattern??(t.pattern=gh),Xr.init(e,t)}),Eh=K("$ZodCheckIncludes",(e,t)=>{Bt.init(e,t);let n=ar(t.includes),i=new RegExp(typeof t.position==="number"?`^.{${t.position}}${n}`:n);t.pattern=i,e._zod.onattach.push((r)=>{let s=r._zod.bag;s.patterns??(s.patterns=new Set),s.patterns.add(i)}),e._zod.check=(r)=>{if(r.value.includes(t.includes,t.position))return;r.issues.push({origin:"string",code:"invalid_format",format:"includes",includes:t.includes,input:r.value,inst:e,continue:!t.abort})}}),Ah=K("$ZodCheckStartsWith",(e,t)=>{Bt.init(e,t);let n=new RegExp(`^${ar(t.prefix)}.*`);t.pattern??(t.pattern=n),e._zod.onattach.push((i)=>{let r=i._zod.bag;r.patterns??(r.patterns=new Set),r.patterns.add(n)}),e._zod.check=(i)=>{if(i.value.startsWith(t.prefix))return;i.issues.push({origin:"string",code:"invalid_format",format:"starts_with",prefix:t.prefix,input:i.value,inst:e,continue:!t.abort})}}),Rh=K("$ZodCheckEndsWith",(e,t)=>{Bt.init(e,t);let n=new RegExp(`.*${ar(t.suffix)}$`);t.pattern??(t.pattern=n),e._zod.onattach.push((i)=>{let r=i._zod.bag;r.patterns??(r.patterns=new Set),r.patterns.add(n)}),e._zod.check=(i)=>{if(i.value.endsWith(t.suffix))return;i.issues.push({origin:"string",code:"invalid_format",format:"ends_with",suffix:t.suffix,input:i.value,inst:e,continue:!t.abort})}});var Ch=K("$ZodCheckOverwrite",(e,t)=>{Bt.init(e,t),e._zod.check=(n)=>{n.value=t.tx(n.value)}});class Ra{constructor(e=[]){if(this.content=[],this.indent=0,this)this.args=e}indented(e){this.indent+=1,e(this),this.indent-=1}write(e){if(typeof e==="function"){e(this,{execution:"sync"}),e(this,{execution:"async"});return}let n=e.split(`
`).filter((s)=>s),i=Math.min(...n.map((s)=>s.length-s.trimStart().length)),r=n.map((s)=>s.slice(i)).map((s)=>" ".repeat(this.indent*2)+s);for(let s of r)this.content.push(s)}compile(){let e=Function,t=this?.args,i=[...(this?.content??[""]).map((r)=>`  ${r}`)];return new e(...t,i.join(`
`))}}var Ph={major:4,minor:4,patch:3};var yt=K("$ZodType",(e,t)=>{var n;e??(e={}),e._zod.def=t,e._zod.bag=e._zod.bag||{},e._zod.version=Ph;let i=[...e._zod.def.checks??[]];if(e._zod.traits.has("$ZodCheck"))i.unshift(e);for(let r of i)for(let s of r._zod.onattach)s(e);if(i.length===0)(n=e._zod).deferred??(n.deferred=[]),e._zod.deferred?.push(()=>{e._zod.run=e._zod.parse});else{let r=(o,a,c)=>{let l=Di(o),u;for(let d of a){if(d._zod.def.when){if(Cu(o))continue;if(!d._zod.def.when(o))continue}else if(l)continue;let h=o.issues.length,f=d._zod.check(o);if(f instanceof Promise&&c?.async===!1)throw new Xn;if(u||f instanceof Promise)u=(u??Promise.resolve()).then(async()=>{if(await f,o.issues.length===h)return;if(!l)l=Di(o,h)});else{if(o.issues.length===h)continue;if(!l)l=Di(o,h)}}if(u)return u.then(()=>o);return o},s=(o,a,c)=>{if(Di(o))return o.aborted=!0,o;let l=r(a,i,c);if(l instanceof Promise){if(c.async===!1)throw new Xn;return l.then((u)=>e._zod.parse(u,c))}return e._zod.parse(l,c)};e._zod.run=(o,a)=>{if(a.skipChecks)return e._zod.parse(o,a);if(a.direction==="backward"){let l=e._zod.parse({value:o.value,issues:[]},{...a,skipChecks:!0});if(l instanceof Promise)return l.then((u)=>s(u,o,a));return s(l,o,a)}let c=e._zod.parse(o,a);if(c instanceof Promise){if(a.async===!1)throw new Xn;return c.then((l)=>r(l,i,a))}return r(c,i,a)}}rt(e,"~standard",()=>({validate:(r)=>{try{let s=Nu(e,r);return s.success?{value:s.data}:{issues:s.error?.issues}}catch(s){return Du(e,r).then((o)=>o.success?{value:o.data}:{issues:o.error?.issues})}},vendor:"zod",version:1}))}),Js=K("$ZodString",(e,t)=>{yt.init(e,t),e._zod.pattern=[...e?._zod.bag?.patterns??[]].pop()??hh(e._zod.bag),e._zod.parse=(n,i)=>{if(t.coerce)try{n.value=String(n.value)}catch(r){}if(typeof n.value==="string")return n;return n.issues.push({expected:"string",code:"invalid_type",input:n.value,inst:e}),n}}),mt=K("$ZodStringFormat",(e,t)=>{Xr.init(e,t),Js.init(e,t)}),Bh=K("$ZodGUID",(e,t)=>{t.pattern??(t.pattern=Ju),mt.init(e,t)}),Gh=K("$ZodUUID",(e,t)=>{if(t.version){let i={v1:1,v2:2,v3:3,v4:4,v5:5,v6:6,v7:7,v8:8}[t.version];if(i===void 0)throw Error(`Invalid UUID version: "${t.version}"`);t.pattern??(t.pattern=wa(i))}else t.pattern??(t.pattern=wa());mt.init(e,t)}),Hh=K("$ZodEmail",(e,t)=>{t.pattern??(t.pattern=Ku),mt.init(e,t)}),Vh=K("$ZodURL",(e,t)=>{mt.init(e,t),e._zod.check=(n)=>{try{let i=n.value.trim();if(!t.normalize&&t.protocol?.source===rh.source){if(!/^https?:\/\//i.test(i)){n.issues.push({code:"invalid_format",format:"url",note:"Invalid URL format",input:n.value,inst:e,continue:!t.abort});return}}let r=new URL(i);if(t.hostname){if(t.hostname.lastIndex=0,!t.hostname.test(r.hostname))n.issues.push({code:"invalid_format",format:"url",note:"Invalid hostname",pattern:t.hostname.source,input:n.value,inst:e,continue:!t.abort})}if(t.protocol){if(t.protocol.lastIndex=0,!t.protocol.test(r.protocol.endsWith(":")?r.protocol.slice(0,-1):r.protocol))n.issues.push({code:"invalid_format",format:"url",note:"Invalid protocol",pattern:t.protocol.source,input:n.value,inst:e,continue:!t.abort})}if(t.normalize)n.value=r.href;else n.value=i;return}catch(i){n.issues.push({code:"invalid_format",format:"url",input:n.value,inst:e,continue:!t.abort})}}}),Wh=K("$ZodEmoji",(e,t)=>{t.pattern??(t.pattern=ju()),mt.init(e,t)}),$h=K("$ZodNanoID",(e,t)=>{t.pattern??(t.pattern=qu),mt.init(e,t)}),Zh=K("$ZodCUID",(e,t)=>{t.pattern??(t.pattern=Vu),mt.init(e,t)}),Xh=K("$ZodCUID2",(e,t)=>{t.pattern??(t.pattern=Wu),mt.init(e,t)}),qh=K("$ZodULID",(e,t)=>{t.pattern??(t.pattern=$u),mt.init(e,t)}),Yh=K("$ZodXID",(e,t)=>{t.pattern??(t.pattern=Zu),mt.init(e,t)}),Jh=K("$ZodKSUID",(e,t)=>{t.pattern??(t.pattern=Xu),mt.init(e,t)}),Kh=K("$ZodISODateTime",(e,t)=>{t.pattern??(t.pattern=uh(t)),mt.init(e,t)}),jh=K("$ZodISODate",(e,t)=>{t.pattern??(t.pattern=ah),mt.init(e,t)}),Qh=K("$ZodISOTime",(e,t)=>{t.pattern??(t.pattern=lh(t)),mt.init(e,t)}),ed=K("$ZodISODuration",(e,t)=>{t.pattern??(t.pattern=Yu),mt.init(e,t)}),td=K("$ZodIPv4",(e,t)=>{t.pattern??(t.pattern=Qu),mt.init(e,t),e._zod.bag.format="ipv4"}),nd=K("$ZodIPv6",(e,t)=>{t.pattern??(t.pattern=eh),mt.init(e,t),e._zod.bag.format="ipv6",e._zod.check=(n)=>{try{new URL(`http://[${n.value}]`)}catch{n.issues.push({code:"invalid_format",format:"ipv6",input:n.value,inst:e,continue:!t.abort})}}});var id=K("$ZodCIDRv4",(e,t)=>{t.pattern??(t.pattern=th),mt.init(e,t)}),rd=K("$ZodCIDRv6",(e,t)=>{t.pattern??(t.pattern=nh),mt.init(e,t),e._zod.check=(n)=>{let i=n.value.split("/");try{if(i.length!==2)throw Error();let[r,s]=i;if(!s)throw Error();let o=Number(s);if(`${o}`!==s)throw Error();if(o<0||o>128)throw Error();new URL(`http://[${r}]`)}catch{n.issues.push({code:"invalid_format",format:"cidrv6",input:n.value,inst:e,continue:!t.abort})}}});function sd(e){if(e==="")return!0;if(/\s/.test(e))return!1;if(e.length%4!==0)return!1;try{return atob(e),!0}catch{return!1}}var od=K("$ZodBase64",(e,t)=>{t.pattern??(t.pattern=ih),mt.init(e,t),e._zod.bag.contentEncoding="base64",e._zod.check=(n)=>{if(sd(n.value))return;n.issues.push({code:"invalid_format",format:"base64",input:n.value,inst:e,continue:!t.abort})}});function P_(e){if(!Ta.test(e))return!1;let t=e.replace(/[-_]/g,(i)=>i==="-"?"+":"/"),n=t.padEnd(Math.ceil(t.length/4)*4,"=");return sd(n)}var ad=K("$ZodBase64URL",(e,t)=>{t.pattern??(t.pattern=Ta),mt.init(e,t),e._zod.bag.contentEncoding="base64url",e._zod.check=(n)=>{if(P_(n.value))return;n.issues.push({code:"invalid_format",format:"base64url",input:n.value,inst:e,continue:!t.abort})}}),cd=K("$ZodE164",(e,t)=>{t.pattern??(t.pattern=sh),mt.init(e,t)});function L_(e,t=null){try{let n=e.split(".");if(n.length!==3)return!1;let[i]=n;if(!i)return!1;let r=JSON.parse(atob(i));if("typ"in r&&r?.typ!=="JWT")return!1;if(!r.alg)return!1;if(t&&(!("alg"in r)||r.alg!==t))return!1;return!0}catch{return!1}}var ld=K("$ZodJWT",(e,t)=>{mt.init(e,t),e._zod.check=(n)=>{if(L_(n.value,t.alg))return;n.issues.push({code:"invalid_format",format:"jwt",input:n.value,inst:e,continue:!t.abort})}});var Ia=K("$ZodNumber",(e,t)=>{yt.init(e,t),e._zod.pattern=e._zod.bag.pattern??fh,e._zod.parse=(n,i)=>{if(t.coerce)try{n.value=Number(n.value)}catch(o){}let r=n.value;if(typeof r==="number"&&!Number.isNaN(r)&&Number.isFinite(r))return n;let s=typeof r==="number"?Number.isNaN(r)?"NaN":!Number.isFinite(r)?"Infinity":void 0:void 0;return n.issues.push({expected:"number",code:"invalid_type",input:r,inst:e,...s?{received:s}:{}}),n}}),ud=K("$ZodNumberFormat",(e,t)=>{vh.init(e,t),Ia.init(e,t)}),hd=K("$ZodBoolean",(e,t)=>{yt.init(e,t),e._zod.pattern=ph,e._zod.parse=(n,i)=>{if(t.coerce)try{n.value=Boolean(n.value)}catch(s){}let r=n.value;if(typeof r==="boolean")return n;return n.issues.push({expected:"boolean",code:"invalid_type",input:r,inst:e}),n}});var dd=K("$ZodUnknown",(e,t)=>{yt.init(e,t),e._zod.parse=(n)=>n}),fd=K("$ZodNever",(e,t)=>{yt.init(e,t),e._zod.parse=(n,i)=>(n.issues.push({expected:"never",code:"invalid_type",input:n.value,inst:e}),n)});function Lh(e,t,n){if(e.issues.length)t.issues.push(...Hs(n,e.issues));t.value[n]=e.value}var pd=K("$ZodArray",(e,t)=>{yt.init(e,t),e._zod.parse=(n,i)=>{let r=n.value;if(!Array.isArray(r))return n.issues.push({expected:"array",code:"invalid_type",input:r,inst:e}),n;n.value=Array(r.length);let s=[];for(let o=0;o<r.length;o++){let a=r[o],c=t.element._zod.run({value:a,issues:[]},i);if(c instanceof Promise)s.push(c.then((l)=>Lh(l,n,o)));else Lh(c,n,o)}if(s.length)return Promise.all(s).then(()=>n);return n}});function Ys(e,t,n,i,r,s){let o=n in i;if(e.issues.length){if(r&&s&&!o)return;t.issues.push(...Hs(n,e.issues))}if(!o&&!r){if(!e.issues.length)t.issues.push({code:"invalid_type",expected:"nonoptional",input:void 0,path:[n]});return}if(e.value===void 0){if(o)t.value[n]=void 0}else t.value[n]=e.value}function md(e){let t=Object.keys(e.shape);for(let i of t)if(!e.shape?.[i]?._zod?.traits?.has("$ZodType"))throw Error(`Invalid element at key "${i}": expected a Zod schema`);let n=Au(e.shape);return{...e,keys:t,keySet:new Set(t),numKeys:t.length,optionalKeys:new Set(n)}}function gd(e,t,n,i,r,s){let o=[],a=r.keySet,c=r.catchall._zod,l=c.def.type,u=c.optin==="optional",d=c.optout==="optional";for(let h in t){if(h==="__proto__")continue;if(a.has(h))continue;if(l==="never"){o.push(h);continue}let f=c.run({value:t[h],issues:[]},i);if(f instanceof Promise)e.push(f.then((g)=>Ys(g,n,h,t,u,d)));else Ys(f,n,h,t,u,d)}if(o.length)n.issues.push({code:"unrecognized_keys",keys:o,input:t,inst:s});if(!e.length)return n;return Promise.all(e).then(()=>n)}var N_=K("$ZodObject",(e,t)=>{if(yt.init(e,t),!Object.getOwnPropertyDescriptor(t,"shape")?.get){let a=t.shape;Object.defineProperty(t,"shape",{get:()=>{let c={...a};return Object.defineProperty(t,"shape",{value:c}),c}})}let i=ks(()=>md(t));rt(e._zod,"propValues",()=>{let a=t.shape,c={};for(let l in a){let u=a[l]._zod;if(u.values){c[l]??(c[l]=new Set);for(let d of u.values)c[l].add(d)}}return c});let r=Vr,s=t.catchall,o;e._zod.parse=(a,c)=>{o??(o=i.value);let l=a.value;if(!r(l))return a.issues.push({expected:"object",code:"invalid_type",input:l,inst:e}),a;a.value={};let u=[],d=o.shape;for(let h of o.keys){let f=d[h],g=f._zod.optin==="optional",S=f._zod.optout==="optional",p=f._zod.run({value:l[h],issues:[]},c);if(p instanceof Promise)u.push(p.then((m)=>Ys(m,a,h,l,g,S)));else Ys(p,a,h,l,g,S)}if(!s)return u.length?Promise.all(u).then(()=>a):a;return gd(u,l,a,c,i.value,e)}}),_d=K("$ZodObjectJIT",(e,t)=>{N_.init(e,t);let n=e._zod.parse,i=ks(()=>md(t)),r=(h)=>{let f=new Ra(["shape","payload","ctx"]),g=i.value,S=(A)=>{let v=ya(A);return`shape[${v}]._zod.run({ value: input[${v}], issues: [] }, ctx)`};f.write("const input = payload.value;");let p=Object.create(null),m=0;for(let A of g.keys)p[A]=`key_${m++}`;f.write("const newResult = {};");for(let A of g.keys){let v=p[A],w=ya(A),E=h[A],R=E?._zod?.optin==="optional",x=E?._zod?.optout==="optional";if(f.write(`const ${v} = ${S(A)};`),R&&x)f.write(`
        if (${v}.issues.length) {
          if (${w} in input) {
            payload.issues = payload.issues.concat(${v}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${w}, ...iss.path] : [${w}]
            })));
          }
        }
        
        if (${v}.value === undefined) {
          if (${w} in input) {
            newResult[${w}] = undefined;
          }
        } else {
          newResult[${w}] = ${v}.value;
        }
        
      `);else if(!R)f.write(`
        const ${v}_present = ${w} in input;
        if (${v}.issues.length) {
          payload.issues = payload.issues.concat(${v}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${w}, ...iss.path] : [${w}]
          })));
        }
        if (!${v}_present && !${v}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${w}]
          });
        }

        if (${v}_present) {
          if (${v}.value === undefined) {
            newResult[${w}] = undefined;
          } else {
            newResult[${w}] = ${v}.value;
          }
        }

      `);else f.write(`
        if (${v}.issues.length) {
          payload.issues = payload.issues.concat(${v}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${w}, ...iss.path] : [${w}]
          })));
        }
        
        if (${v}.value === undefined) {
          if (${w} in input) {
            newResult[${w}] = undefined;
          }
        } else {
          newResult[${w}] = ${v}.value;
        }
        
      `)}f.write("payload.value = newResult;"),f.write("return payload;");let T=f.compile();return(A,v)=>T(h,A,v)},s,o=Vr,a=!sr.jitless,l=a&&Tu.value,u=t.catchall,d;e._zod.parse=(h,f)=>{d??(d=i.value);let g=h.value;if(!o(g))return h.issues.push({expected:"object",code:"invalid_type",input:g,inst:e}),h;if(a&&l&&f?.async===!1&&f.jitless!==!0){if(!s)s=r(t.shape);if(h=s(h,f),!u)return h;return gd([],g,h,f,d,e)}return n(h,f)}});function Nh(e,t,n,i){for(let s of e)if(s.issues.length===0)return t.value=s.value,t;let r=e.filter((s)=>!Di(s));if(r.length===1)return t.value=r[0].value,r[0];return t.issues.push({code:"invalid_union",input:t.value,inst:n,errors:e.map((s)=>s.issues.map((o)=>Yn(o,i,qn())))}),t}var xd=K("$ZodUnion",(e,t)=>{yt.init(e,t),rt(e._zod,"optin",()=>t.options.some((i)=>i._zod.optin==="optional")?"optional":void 0),rt(e._zod,"optout",()=>t.options.some((i)=>i._zod.optout==="optional")?"optional":void 0),rt(e._zod,"values",()=>{if(t.options.every((i)=>i._zod.values))return new Set(t.options.flatMap((i)=>Array.from(i._zod.values)));return}),rt(e._zod,"pattern",()=>{if(t.options.every((i)=>i._zod.pattern)){let i=t.options.map((r)=>r._zod.pattern);return new RegExp(`^(${i.map((r)=>Gs(r.source)).join("|")})$`)}return});let n=t.options.length===1?t.options[0]._zod.run:null;e._zod.parse=(i,r)=>{if(n)return n(i,r);let s=!1,o=[];for(let a of t.options){let c=a._zod.run({value:i.value,issues:[]},r);if(c instanceof Promise)o.push(c),s=!0;else{if(c.issues.length===0)return c;o.push(c)}}if(!s)return Nh(o,i,e,r);return Promise.all(o).then((a)=>Nh(a,i,e,r))}});var vd=K("$ZodIntersection",(e,t)=>{yt.init(e,t),e._zod.parse=(n,i)=>{let r=n.value,s=t.left._zod.run({value:r,issues:[]},i),o=t.right._zod.run({value:r,issues:[]},i);if(s instanceof Promise||o instanceof Promise)return Promise.all([s,o]).then(([c,l])=>Dh(n,c,l));return Dh(n,s,o)}});function Ca(e,t){if(e===t)return{valid:!0,data:e};if(e instanceof Date&&t instanceof Date&&+e===+t)return{valid:!0,data:e};if(or(e)&&or(t)){let n=Object.keys(t),i=Object.keys(e).filter((s)=>n.indexOf(s)!==-1),r={...e,...t};for(let s of i){let o=Ca(e[s],t[s]);if(!o.valid)return{valid:!1,mergeErrorPath:[s,...o.mergeErrorPath]};r[s]=o.data}return{valid:!0,data:r}}if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return{valid:!1,mergeErrorPath:[]};let n=[];for(let i=0;i<e.length;i++){let r=e[i],s=t[i],o=Ca(r,s);if(!o.valid)return{valid:!1,mergeErrorPath:[i,...o.mergeErrorPath]};n.push(o.data)}return{valid:!0,data:n}}return{valid:!1,mergeErrorPath:[]}}function Dh(e,t,n){let i=new Map,r;for(let a of t.issues)if(a.code==="unrecognized_keys"){r??(r=a);for(let c of a.keys){if(!i.has(c))i.set(c,{});i.get(c).l=!0}}else e.issues.push(a);for(let a of n.issues)if(a.code==="unrecognized_keys")for(let c of a.keys){if(!i.has(c))i.set(c,{});i.get(c).r=!0}else e.issues.push(a);let s=[...i].filter(([,a])=>a.l&&a.r).map(([a])=>a);if(s.length&&r)e.issues.push({...r,keys:s});if(Di(e))return e;let o=Ca(t.value,n.value);if(!o.valid)throw Error(`Unmergable intersection. Error path: ${JSON.stringify(o.mergeErrorPath)}`);return e.value=o.data,e}var yd=K("$ZodEnum",(e,t)=>{yt.init(e,t);let n=zs(t.entries),i=new Set(n);e._zod.values=i,e._zod.pattern=new RegExp(`^(${n.filter((r)=>Eu.has(typeof r)).map((r)=>typeof r==="string"?ar(r):r.toString()).join("|")})$`),e._zod.parse=(r,s)=>{let o=r.value;if(i.has(o))return r;return r.issues.push({code:"invalid_value",values:n,input:o,inst:e}),r}});var Sd=K("$ZodTransform",(e,t)=>{yt.init(e,t),e._zod.optin="optional",e._zod.parse=(n,i)=>{if(i.direction==="backward")throw new Hr(e.constructor.name);let r=t.transform(n.value,n);if(i.async)return(r instanceof Promise?r:Promise.resolve(r)).then((o)=>(n.value=o,n.fallback=!0,n));if(r instanceof Promise)throw new Xn;return n.value=r,n.fallback=!0,n}});function Uh(e,t){if(t===void 0&&(e.issues.length||e.fallback))return{issues:[],value:void 0};return e}var Pa=K("$ZodOptional",(e,t)=>{yt.init(e,t),e._zod.optin="optional",e._zod.optout="optional",rt(e._zod,"values",()=>t.innerType._zod.values?new Set([...t.innerType._zod.values,void 0]):void 0),rt(e._zod,"pattern",()=>{let n=t.innerType._zod.pattern;return n?new RegExp(`^(${Gs(n.source)})?$`):void 0}),e._zod.parse=(n,i)=>{if(t.innerType._zod.optin==="optional"){let r=n.value,s=t.innerType._zod.run(n,i);if(s instanceof Promise)return s.then((o)=>Uh(o,r));return Uh(s,r)}if(n.value===void 0)return n;return t.innerType._zod.run(n,i)}}),bd=K("$ZodExactOptional",(e,t)=>{Pa.init(e,t),rt(e._zod,"values",()=>t.innerType._zod.values),rt(e._zod,"pattern",()=>t.innerType._zod.pattern),e._zod.parse=(n,i)=>t.innerType._zod.run(n,i)}),Md=K("$ZodNullable",(e,t)=>{yt.init(e,t),rt(e._zod,"optin",()=>t.innerType._zod.optin),rt(e._zod,"optout",()=>t.innerType._zod.optout),rt(e._zod,"pattern",()=>{let n=t.innerType._zod.pattern;return n?new RegExp(`^(${Gs(n.source)}|null)$`):void 0}),rt(e._zod,"values",()=>t.innerType._zod.values?new Set([...t.innerType._zod.values,null]):void 0),e._zod.parse=(n,i)=>{if(n.value===null)return n;return t.innerType._zod.run(n,i)}}),wd=K("$ZodDefault",(e,t)=>{yt.init(e,t),e._zod.optin="optional",rt(e._zod,"values",()=>t.innerType._zod.values),e._zod.parse=(n,i)=>{if(i.direction==="backward")return t.innerType._zod.run(n,i);if(n.value===void 0)return n.value=t.defaultValue,n;let r=t.innerType._zod.run(n,i);if(r instanceof Promise)return r.then((s)=>Oh(s,t));return Oh(r,t)}});function Oh(e,t){if(e.value===void 0)e.value=t.defaultValue;return e}var Td=K("$ZodPrefault",(e,t)=>{yt.init(e,t),e._zod.optin="optional",rt(e._zod,"values",()=>t.innerType._zod.values),e._zod.parse=(n,i)=>{if(i.direction==="backward")return t.innerType._zod.run(n,i);if(n.value===void 0)n.value=t.defaultValue;return t.innerType._zod.run(n,i)}}),Ed=K("$ZodNonOptional",(e,t)=>{yt.init(e,t),rt(e._zod,"values",()=>{let n=t.innerType._zod.values;return n?new Set([...n].filter((i)=>i!==void 0)):void 0}),e._zod.parse=(n,i)=>{let r=t.innerType._zod.run(n,i);if(r instanceof Promise)return r.then((s)=>Fh(s,e));return Fh(r,e)}});function Fh(e,t){if(!e.issues.length&&e.value===void 0)e.issues.push({code:"invalid_type",expected:"nonoptional",input:e.value,inst:t});return e}var Ad=K("$ZodCatch",(e,t)=>{yt.init(e,t),e._zod.optin="optional",rt(e._zod,"optout",()=>t.innerType._zod.optout),rt(e._zod,"values",()=>t.innerType._zod.values),e._zod.parse=(n,i)=>{if(i.direction==="backward")return t.innerType._zod.run(n,i);let r=t.innerType._zod.run(n,i);if(r instanceof Promise)return r.then((s)=>{if(n.value=s.value,s.issues.length)n.value=t.catchValue({...n,error:{issues:s.issues.map((o)=>Yn(o,i,qn()))},input:n.value}),n.issues=[],n.fallback=!0;return n});if(n.value=r.value,r.issues.length)n.value=t.catchValue({...n,error:{issues:r.issues.map((s)=>Yn(s,i,qn()))},input:n.value}),n.issues=[],n.fallback=!0;return n}});var Rd=K("$ZodPipe",(e,t)=>{yt.init(e,t),rt(e._zod,"values",()=>t.in._zod.values),rt(e._zod,"optin",()=>t.in._zod.optin),rt(e._zod,"optout",()=>t.out._zod.optout),rt(e._zod,"propValues",()=>t.in._zod.propValues),e._zod.parse=(n,i)=>{if(i.direction==="backward"){let s=t.out._zod.run(n,i);if(s instanceof Promise)return s.then((o)=>qs(o,t.in,i));return qs(s,t.in,i)}let r=t.in._zod.run(n,i);if(r instanceof Promise)return r.then((s)=>qs(s,t.out,i));return qs(r,t.out,i)}});function qs(e,t,n){if(e.issues.length)return e.aborted=!0,e;return t._zod.run({value:e.value,issues:e.issues,fallback:e.fallback},n)}var Cd=K("$ZodReadonly",(e,t)=>{yt.init(e,t),rt(e._zod,"propValues",()=>t.innerType._zod.propValues),rt(e._zod,"values",()=>t.innerType._zod.values),rt(e._zod,"optin",()=>t.innerType?._zod?.optin),rt(e._zod,"optout",()=>t.innerType?._zod?.optout),e._zod.parse=(n,i)=>{if(i.direction==="backward")return t.innerType._zod.run(n,i);let r=t.innerType._zod.run(n,i);if(r instanceof Promise)return r.then(zh);return zh(r)}});function zh(e){return e.value=Object.freeze(e.value),e}var Id=K("$ZodCustom",(e,t)=>{Bt.init(e,t),yt.init(e,t),e._zod.parse=(n,i)=>n,e._zod.check=(n)=>{let i=n.value,r=t.fn(i);if(r instanceof Promise)return r.then((s)=>kh(s,n,i,e));kh(r,n,i,e);return}});function kh(e,t,n,i){if(!e){let r={code:"custom",input:n,inst:i,path:[...i._zod.def.path??[]],continue:!i._zod.def.abort};if(i._zod.def.params)r.params=i._zod.def.params;t.issues.push(Ui(r))}}var Pd,gw=Symbol("ZodOutput"),_w=Symbol("ZodInput");class Ld{constructor(){this._map=new WeakMap,this._idmap=new Map}add(e,...t){let n=t[0];if(this._map.set(e,n),n&&typeof n==="object"&&"id"in n)this._idmap.set(n.id,e);return this}clear(){return this._map=new WeakMap,this._idmap=new Map,this}remove(e){let t=this._map.get(e);if(t&&typeof t==="object"&&"id"in t)this._idmap.delete(t.id);return this._map.delete(e),this}get(e){let t=e._zod.parent;if(t){let n={...this.get(t)??{}};delete n.id;let i={...n,...this._map.get(e)};return Object.keys(i).length?i:void 0}return this._map.get(e)}has(e){return this._map.has(e)}}function D_(){return new Ld}(Pd=globalThis).__zod_globalRegistry??(Pd.__zod_globalRegistry=D_());var Oi=globalThis.__zod_globalRegistry;function Nd(e,t){return new e({type:"string",...Ae(t)})}function Dd(e,t){return new e({type:"string",format:"email",check:"string_format",abort:!1,...Ae(t)})}function La(e,t){return new e({type:"string",format:"guid",check:"string_format",abort:!1,...Ae(t)})}function Ud(e,t){return new e({type:"string",format:"uuid",check:"string_format",abort:!1,...Ae(t)})}function Od(e,t){return new e({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v4",...Ae(t)})}function Fd(e,t){return new e({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v6",...Ae(t)})}function zd(e,t){return new e({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v7",...Ae(t)})}function kd(e,t){return new e({type:"string",format:"url",check:"string_format",abort:!1,...Ae(t)})}function Bd(e,t){return new e({type:"string",format:"emoji",check:"string_format",abort:!1,...Ae(t)})}function Gd(e,t){return new e({type:"string",format:"nanoid",check:"string_format",abort:!1,...Ae(t)})}function Hd(e,t){return new e({type:"string",format:"cuid",check:"string_format",abort:!1,...Ae(t)})}function Vd(e,t){return new e({type:"string",format:"cuid2",check:"string_format",abort:!1,...Ae(t)})}function Wd(e,t){return new e({type:"string",format:"ulid",check:"string_format",abort:!1,...Ae(t)})}function $d(e,t){return new e({type:"string",format:"xid",check:"string_format",abort:!1,...Ae(t)})}function Zd(e,t){return new e({type:"string",format:"ksuid",check:"string_format",abort:!1,...Ae(t)})}function Xd(e,t){return new e({type:"string",format:"ipv4",check:"string_format",abort:!1,...Ae(t)})}function qd(e,t){return new e({type:"string",format:"ipv6",check:"string_format",abort:!1,...Ae(t)})}function Yd(e,t){return new e({type:"string",format:"cidrv4",check:"string_format",abort:!1,...Ae(t)})}function Jd(e,t){return new e({type:"string",format:"cidrv6",check:"string_format",abort:!1,...Ae(t)})}function Kd(e,t){return new e({type:"string",format:"base64",check:"string_format",abort:!1,...Ae(t)})}function jd(e,t){return new e({type:"string",format:"base64url",check:"string_format",abort:!1,...Ae(t)})}function Qd(e,t){return new e({type:"string",format:"e164",check:"string_format",abort:!1,...Ae(t)})}function ef(e,t){return new e({type:"string",format:"jwt",check:"string_format",abort:!1,...Ae(t)})}function tf(e,t){return new e({type:"string",format:"datetime",check:"string_format",offset:!1,local:!1,precision:null,...Ae(t)})}function nf(e,t){return new e({type:"string",format:"date",check:"string_format",...Ae(t)})}function rf(e,t){return new e({type:"string",format:"time",check:"string_format",precision:null,...Ae(t)})}function sf(e,t){return new e({type:"string",format:"duration",check:"string_format",...Ae(t)})}function of(e,t){return new e({type:"number",checks:[],...Ae(t)})}function af(e,t){return new e({type:"number",check:"number_format",abort:!1,format:"safeint",...Ae(t)})}function cf(e,t){return new e({type:"boolean",...Ae(t)})}function lf(e){return new e({type:"unknown"})}function uf(e,t){return new e({type:"never",...Ae(t)})}function Ks(e,t){return new Ea({check:"less_than",...Ae(t),value:e,inclusive:!1})}function qr(e,t){return new Ea({check:"less_than",...Ae(t),value:e,inclusive:!0})}function js(e,t){return new Aa({check:"greater_than",...Ae(t),value:e,inclusive:!1})}function Yr(e,t){return new Aa({check:"greater_than",...Ae(t),value:e,inclusive:!0})}function Qs(e,t){return new xh({check:"multiple_of",...Ae(t),value:e})}function eo(e,t){return new yh({check:"max_length",...Ae(t),maximum:e})}function cr(e,t){return new Sh({check:"min_length",...Ae(t),minimum:e})}function to(e,t){return new bh({check:"length_equals",...Ae(t),length:e})}function Na(e,t){return new Mh({check:"string_format",format:"regex",...Ae(t),pattern:e})}function Da(e){return new wh({check:"string_format",format:"lowercase",...Ae(e)})}function Ua(e){return new Th({check:"string_format",format:"uppercase",...Ae(e)})}function Oa(e,t){return new Eh({check:"string_format",format:"includes",...Ae(t),includes:e})}function Fa(e,t){return new Ah({check:"string_format",format:"starts_with",...Ae(t),prefix:e})}function za(e,t){return new Rh({check:"string_format",format:"ends_with",...Ae(t),suffix:e})}function fi(e){return new Ch({check:"overwrite",tx:e})}function ka(e){return fi((t)=>t.normalize(e))}function Ba(){return fi((e)=>e.trim())}function Ga(){return fi((e)=>e.toLowerCase())}function Ha(){return fi((e)=>e.toUpperCase())}function Va(){return fi((e)=>wu(e))}function hf(e,t,n){return new e({type:"array",element:t,...Ae(n)})}function df(e,t,n){return new e({type:"custom",check:"custom",fn:t,...Ae(n)})}function ff(e,t){let n=U_((i)=>(i.addIssue=(r)=>{if(typeof r==="string")i.issues.push(Ui(r,i.value,n._zod.def));else{let s=r;if(s.fatal)s.continue=!1;s.code??(s.code="custom"),s.input??(s.input=i.value),s.inst??(s.inst=n),s.continue??(s.continue=!n._zod.def.abort),i.issues.push(Ui(s))}},e(i.value,i)),t);return n}function U_(e,t){let n=new Bt({check:"custom",...Ae(t)});return n._zod.check=e,n}function Wa(e){let t=e?.target??"draft-2020-12";if(t==="draft-4")t="draft-04";if(t==="draft-7")t="draft-07";return{processors:e.processors??{},metadataRegistry:e?.metadata??Oi,target:t,unrepresentable:e?.unrepresentable??"throw",override:e?.override??(()=>{}),io:e?.io??"output",counter:0,seen:new Map,cycles:e?.cycles??"ref",reused:e?.reused??"inline",external:e?.external??void 0}}function Ut(e,t,n={path:[],schemaPath:[]}){var i;let r=e._zod.def,s=t.seen.get(e);if(s){if(s.count++,n.schemaPath.includes(e))s.cycle=n.path;return s.schema}let o={schema:{},count:1,cycle:void 0,path:n.path};t.seen.set(e,o);let a=e._zod.toJSONSchema?.();if(a)o.schema=a;else{let u={...n,schemaPath:[...n.schemaPath,e],path:n.path};if(e._zod.processJSONSchema)e._zod.processJSONSchema(t,o.schema,u);else{let h=o.schema,f=t.processors[r.type];if(!f)throw Error(`[toJSONSchema]: Non-representable type encountered: ${r.type}`);f(e,t,h,u)}let d=e._zod.parent;if(d){if(!o.ref)o.ref=d;Ut(d,t,u),t.seen.get(d).isParent=!0}}let c=t.metadataRegistry.get(e);if(c)Object.assign(o.schema,c);if(t.io==="input"&&Xt(e))delete o.schema.examples,delete o.schema.default;if(t.io==="input"&&"_prefault"in o.schema)(i=o.schema).default??(i.default=o.schema._prefault);return delete o.schema._prefault,t.seen.get(e).schema}function $a(e,t){let n=e.seen.get(t);if(!n)throw Error("Unprocessed schema. This is a bug in Zod.");let i=new Map;for(let o of e.seen.entries()){let a=e.metadataRegistry.get(o[0])?.id;if(a){let c=i.get(a);if(c&&c!==o[0])throw Error(`Duplicate schema id "${a}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);i.set(a,o[0])}}let r=(o)=>{let a=e.target==="draft-2020-12"?"$defs":"definitions";if(e.external){let d=e.external.registry.get(o[0])?.id,h=e.external.uri??((g)=>g);if(d)return{ref:h(d)};let f=o[1].defId??o[1].schema.id??`schema${e.counter++}`;return o[1].defId=f,{defId:f,ref:`${h("__shared")}#/${a}/${f}`}}if(o[1]===n)return{ref:"#"};let l=`${"#"}/${a}/`,u=o[1].schema.id??`__schema${e.counter++}`;return{defId:u,ref:l+u}},s=(o)=>{if(o[1].schema.$ref)return;let a=o[1],{ref:c,defId:l}=r(o);if(a.def={...a.schema},l)a.defId=l;let u=a.schema;for(let d in u)delete u[d];u.$ref=c};if(e.cycles==="throw")for(let o of e.seen.entries()){let a=o[1];if(a.cycle)throw Error(`Cycle detected: #/${a.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`)}for(let o of e.seen.entries()){let a=o[1];if(t===o[0]){s(o);continue}if(e.external){let l=e.external.registry.get(o[0])?.id;if(t!==o[0]&&l){s(o);continue}}if(e.metadataRegistry.get(o[0])?.id){s(o);continue}if(a.cycle){s(o);continue}if(a.count>1){if(e.reused==="ref"){s(o);continue}}}}function Za(e,t){let n=e.seen.get(t);if(!n)throw Error("Unprocessed schema. This is a bug in Zod.");let i=(a)=>{let c=e.seen.get(a);if(c.ref===null)return;let l=c.def??c.schema,u={...l},d=c.ref;if(c.ref=null,d){i(d);let f=e.seen.get(d),g=f.schema;if(g.$ref&&(e.target==="draft-07"||e.target==="draft-04"||e.target==="openapi-3.0"))l.allOf=l.allOf??[],l.allOf.push(g);else Object.assign(l,g);if(Object.assign(l,u),a._zod.parent===d)for(let p in l){if(p==="$ref"||p==="allOf")continue;if(!(p in u))delete l[p]}if(g.$ref&&f.def)for(let p in l){if(p==="$ref"||p==="allOf")continue;if(p in f.def&&JSON.stringify(l[p])===JSON.stringify(f.def[p]))delete l[p]}}let h=a._zod.parent;if(h&&h!==d){i(h);let f=e.seen.get(h);if(f?.schema.$ref){if(l.$ref=f.schema.$ref,f.def)for(let g in l){if(g==="$ref"||g==="allOf")continue;if(g in f.def&&JSON.stringify(l[g])===JSON.stringify(f.def[g]))delete l[g]}}}e.override({zodSchema:a,jsonSchema:l,path:c.path??[]})};for(let a of[...e.seen.entries()].reverse())i(a[0]);let r={};if(e.target==="draft-2020-12")r.$schema="https://json-schema.org/draft/2020-12/schema";else if(e.target==="draft-07")r.$schema="http://json-schema.org/draft-07/schema#";else if(e.target==="draft-04")r.$schema="http://json-schema.org/draft-04/schema#";else if(e.target==="openapi-3.0");if(e.external?.uri){let a=e.external.registry.get(t)?.id;if(!a)throw Error("Schema is missing an `id` property");r.$id=e.external.uri(a)}Object.assign(r,n.def??n.schema);let s=e.metadataRegistry.get(t)?.id;if(s!==void 0&&r.id===s)delete r.id;let o=e.external?.defs??{};for(let a of e.seen.entries()){let c=a[1];if(c.def&&c.defId){if(c.def.id===c.defId)delete c.def.id;o[c.defId]=c.def}}if(e.external);else if(Object.keys(o).length>0)if(e.target==="draft-2020-12")r.$defs=o;else r.definitions=o;try{let a=JSON.parse(JSON.stringify(r));return Object.defineProperty(a,"~standard",{value:{...t["~standard"],jsonSchema:{input:Jr(t,"input",e.processors),output:Jr(t,"output",e.processors)}},enumerable:!1,writable:!1}),a}catch(a){throw Error("Error converting schema to JSON.")}}function Xt(e,t){let n=t??{seen:new Set};if(n.seen.has(e))return!1;n.seen.add(e);let i=e._zod.def;if(i.type==="transform")return!0;if(i.type==="array")return Xt(i.element,n);if(i.type==="set")return Xt(i.valueType,n);if(i.type==="lazy")return Xt(i.getter(),n);if(i.type==="promise"||i.type==="optional"||i.type==="nonoptional"||i.type==="nullable"||i.type==="readonly"||i.type==="default"||i.type==="prefault")return Xt(i.innerType,n);if(i.type==="intersection")return Xt(i.left,n)||Xt(i.right,n);if(i.type==="record"||i.type==="map")return Xt(i.keyType,n)||Xt(i.valueType,n);if(i.type==="pipe"){if(e._zod.traits.has("$ZodCodec"))return!0;return Xt(i.in,n)||Xt(i.out,n)}if(i.type==="object"){for(let r in i.shape)if(Xt(i.shape[r],n))return!0;return!1}if(i.type==="union"){for(let r of i.options)if(Xt(r,n))return!0;return!1}if(i.type==="tuple"){for(let r of i.items)if(Xt(r,n))return!0;if(i.rest&&Xt(i.rest,n))return!0;return!1}return!1}var pf=(e,t={})=>(n)=>{let i=Wa({...n,processors:t});return Ut(e,i),$a(i,e),Za(i,e)},Jr=(e,t,n={})=>(i)=>{let{libraryOptions:r,target:s}=i??{},o=Wa({...r??{},target:s,io:t,processors:n});return Ut(e,o),$a(o,e),Za(o,e)};var O_={guid:"uuid",url:"uri",datetime:"date-time",json_string:"json-string",regex:""},mf=(e,t,n,i)=>{let r=n;r.type="string";let{minimum:s,maximum:o,format:a,patterns:c,contentEncoding:l}=e._zod.bag;if(typeof s==="number")r.minLength=s;if(typeof o==="number")r.maxLength=o;if(a){if(r.format=O_[a]??a,r.format==="")delete r.format;if(a==="time")delete r.format}if(l)r.contentEncoding=l;if(c&&c.size>0){let u=[...c];if(u.length===1)r.pattern=u[0].source;else if(u.length>1)r.allOf=[...u.map((d)=>({...t.target==="draft-07"||t.target==="draft-04"||t.target==="openapi-3.0"?{type:"string"}:{},pattern:d.source}))]}},gf=(e,t,n,i)=>{let r=n,{minimum:s,maximum:o,format:a,multipleOf:c,exclusiveMaximum:l,exclusiveMinimum:u}=e._zod.bag;if(typeof a==="string"&&a.includes("int"))r.type="integer";else r.type="number";let d=typeof u==="number"&&u>=(s??Number.NEGATIVE_INFINITY),h=typeof l==="number"&&l<=(o??Number.POSITIVE_INFINITY),f=t.target==="draft-04"||t.target==="openapi-3.0";if(d)if(f)r.minimum=u,r.exclusiveMinimum=!0;else r.exclusiveMinimum=u;else if(typeof s==="number")r.minimum=s;if(h)if(f)r.maximum=l,r.exclusiveMaximum=!0;else r.exclusiveMaximum=l;else if(typeof o==="number")r.maximum=o;if(typeof c==="number")r.multipleOf=c},_f=(e,t,n,i)=>{n.type="boolean"};var xf=(e,t,n,i)=>{n.not={}};var vf=(e,t,n,i)=>{};var yf=(e,t,n,i)=>{let r=e._zod.def,s=zs(r.entries);if(s.every((o)=>typeof o==="number"))n.type="number";if(s.every((o)=>typeof o==="string"))n.type="string";n.enum=s};var Sf=(e,t,n,i)=>{if(t.unrepresentable==="throw")throw Error("Custom types cannot be represented in JSON Schema")};var bf=(e,t,n,i)=>{if(t.unrepresentable==="throw")throw Error("Transforms cannot be represented in JSON Schema")};var Mf=(e,t,n,i)=>{let r=n,s=e._zod.def,{minimum:o,maximum:a}=e._zod.bag;if(typeof o==="number")r.minItems=o;if(typeof a==="number")r.maxItems=a;r.type="array",r.items=Ut(s.element,t,{...i,path:[...i.path,"items"]})},wf=(e,t,n,i)=>{let r=n,s=e._zod.def;r.type="object",r.properties={};let o=s.shape;for(let l in o)r.properties[l]=Ut(o[l],t,{...i,path:[...i.path,"properties",l]});let a=new Set(Object.keys(o)),c=new Set([...a].filter((l)=>{let u=s.shape[l]._zod;if(t.io==="input")return u.optin===void 0;else return u.optout===void 0}));if(c.size>0)r.required=Array.from(c);if(s.catchall?._zod.def.type==="never")r.additionalProperties=!1;else if(!s.catchall){if(t.io==="output")r.additionalProperties=!1}else if(s.catchall)r.additionalProperties=Ut(s.catchall,t,{...i,path:[...i.path,"additionalProperties"]})},Tf=(e,t,n,i)=>{let r=e._zod.def,s=r.inclusive===!1,o=r.options.map((a,c)=>Ut(a,t,{...i,path:[...i.path,s?"oneOf":"anyOf",c]}));if(s)n.oneOf=o;else n.anyOf=o},Ef=(e,t,n,i)=>{let r=e._zod.def,s=Ut(r.left,t,{...i,path:[...i.path,"allOf",0]}),o=Ut(r.right,t,{...i,path:[...i.path,"allOf",1]}),a=(l)=>("allOf"in l)&&Object.keys(l).length===1,c=[...a(s)?s.allOf:[s],...a(o)?o.allOf:[o]];n.allOf=c};var Af=(e,t,n,i)=>{let r=e._zod.def,s=Ut(r.innerType,t,i),o=t.seen.get(e);if(t.target==="openapi-3.0")o.ref=r.innerType,n.nullable=!0;else n.anyOf=[s,{type:"null"}]},Rf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType},Cf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType,n.default=JSON.parse(JSON.stringify(r.defaultValue))},If=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);if(s.ref=r.innerType,t.io==="input")n._prefault=JSON.parse(JSON.stringify(r.defaultValue))},Pf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType;let o;try{o=r.catchValue(void 0)}catch{throw Error("Dynamic catch values are not supported in JSON Schema")}n.default=o},Lf=(e,t,n,i)=>{let r=e._zod.def,s=r.in._zod.traits.has("$ZodTransform"),o=t.io==="input"?s?r.out:r.in:r.out;Ut(o,t,i);let a=t.seen.get(e);a.ref=o},Nf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType,n.readOnly=!0};var Xa=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType};var V_=K("ZodISODateTime",(e,t)=>{Kh.init(e,t),gt.init(e,t)});function Df(e){return tf(V_,e)}var W_=K("ZodISODate",(e,t)=>{jh.init(e,t),gt.init(e,t)});function Uf(e){return nf(W_,e)}var $_=K("ZodISOTime",(e,t)=>{Qh.init(e,t),gt.init(e,t)});function Of(e){return rf($_,e)}var Z_=K("ZodISODuration",(e,t)=>{ed.init(e,t),gt.init(e,t)});function Ff(e){return sf(Z_,e)}var Y_=(e,t)=>{Ws.init(e,t),e.name="ZodError",Object.defineProperties(e,{format:{value:(n)=>Lu(e,n)},flatten:{value:(n)=>Pu(e,n)},addIssue:{value:(n)=>{e.issues.push(n),e.message=JSON.stringify(e.issues,Wr,2)}},addIssues:{value:(n)=>{e.issues.push(...n),e.message=JSON.stringify(e.issues,Wr,2)}},isEmpty:{get(){return e.issues.length===0}}})};var Qt=K("ZodError",Y_,{Parent:Error});var zf=$s(Qt),kf=Zs(Qt),Bf=$r(Qt),Gf=Zr(Qt),Hf=Uu(Qt),Vf=Ou(Qt),Wf=Fu(Qt),$f=zu(Qt),Zf=ku(Qt),Xf=Bu(Qt),qf=Gu(Qt),Yf=Hu(Qt);var Jf=new WeakMap;function Kr(e,t,n){let i=Object.getPrototypeOf(e),r=Jf.get(i);if(!r)r=new Set,Jf.set(i,r);if(r.has(t))return;r.add(t);for(let s in n){let o=n[s];Object.defineProperty(i,s,{configurable:!0,enumerable:!1,get(){let a=o.bind(this);return Object.defineProperty(this,s,{configurable:!0,writable:!0,enumerable:!0,value:a}),a},set(a){Object.defineProperty(this,s,{configurable:!0,writable:!0,enumerable:!0,value:a})}})}}var wt=K("ZodType",(e,t)=>(yt.init(e,t),Object.assign(e["~standard"],{jsonSchema:{input:Jr(e,"input"),output:Jr(e,"output")}}),e.toJSONSchema=pf(e,{}),e.def=t,e.type=t.type,Object.defineProperty(e,"_def",{value:t}),e.parse=(n,i)=>zf(e,n,i,{callee:e.parse}),e.safeParse=(n,i)=>Bf(e,n,i),e.parseAsync=async(n,i)=>kf(e,n,i,{callee:e.parseAsync}),e.safeParseAsync=async(n,i)=>Gf(e,n,i),e.spa=e.safeParseAsync,e.encode=(n,i)=>Hf(e,n,i),e.decode=(n,i)=>Vf(e,n,i),e.encodeAsync=async(n,i)=>Wf(e,n,i),e.decodeAsync=async(n,i)=>$f(e,n,i),e.safeEncode=(n,i)=>Zf(e,n,i),e.safeDecode=(n,i)=>Xf(e,n,i),e.safeEncodeAsync=async(n,i)=>qf(e,n,i),e.safeDecodeAsync=async(n,i)=>Yf(e,n,i),Kr(e,"ZodType",{check(...n){let i=this.def;return this.clone(hi(i,{checks:[...i.checks??[],...n.map((r)=>typeof r==="function"?{_zod:{check:r,def:{check:"custom"},onattach:[]}}:r)]}),{parent:!0})},with(...n){return this.check(...n)},clone(n,i){return In(this,n,i)},brand(){return this},register(n,i){return n.add(this,i),this},refine(n,i){return this.check(H0(n,i))},superRefine(n,i){return this.check(V0(n,i))},overwrite(n){return this.check(fi(n))},optional(){return ep(this)},exactOptional(){return C0(this)},nullable(){return tp(this)},nullish(){return ep(tp(this))},nonoptional(n){return U0(this,n)},array(){return pi(this)},or(n){return M0([this,n])},and(n){return T0(this,n)},transform(n){return np(this,A0(n))},default(n){return L0(this,n)},prefault(n){return D0(this,n)},catch(n){return F0(this,n)},pipe(n){return np(this,n)},readonly(){return B0(this)},describe(n){let i=this.clone();return Oi.add(i,{description:n}),i},meta(...n){if(n.length===0)return Oi.get(this);let i=this.clone();return Oi.add(i,n[0]),i},isOptional(){return this.safeParse(void 0).success},isNullable(){return this.safeParse(null).success},apply(n){return n(this)}}),Object.defineProperty(e,"description",{get(){return Oi.get(e)?.description},configurable:!0}),e)),ip=K("_ZodString",(e,t)=>{Js.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(i,r,s)=>mf(e,i,r,s);let n=e._zod.bag;e.format=n.format??null,e.minLength=n.minimum??null,e.maxLength=n.maximum??null,Kr(e,"_ZodString",{regex(...i){return this.check(Na(...i))},includes(...i){return this.check(Oa(...i))},startsWith(...i){return this.check(Fa(...i))},endsWith(...i){return this.check(za(...i))},min(...i){return this.check(cr(...i))},max(...i){return this.check(eo(...i))},length(...i){return this.check(to(...i))},nonempty(...i){return this.check(cr(1,...i))},lowercase(i){return this.check(Da(i))},uppercase(i){return this.check(Ua(i))},trim(){return this.check(Ba())},normalize(...i){return this.check(ka(...i))},toLowerCase(){return this.check(Ga())},toUpperCase(){return this.check(Ha())},slugify(){return this.check(Va())}})}),K_=K("ZodString",(e,t)=>{Js.init(e,t),ip.init(e,t),e.email=(n)=>e.check(Dd(j_,n)),e.url=(n)=>e.check(kd(Q_,n)),e.jwt=(n)=>e.check(ef(p0,n)),e.emoji=(n)=>e.check(Bd(e0,n)),e.guid=(n)=>e.check(La(Kf,n)),e.uuid=(n)=>e.check(Ud(io,n)),e.uuidv4=(n)=>e.check(Od(io,n)),e.uuidv6=(n)=>e.check(Fd(io,n)),e.uuidv7=(n)=>e.check(zd(io,n)),e.nanoid=(n)=>e.check(Gd(t0,n)),e.guid=(n)=>e.check(La(Kf,n)),e.cuid=(n)=>e.check(Hd(n0,n)),e.cuid2=(n)=>e.check(Vd(i0,n)),e.ulid=(n)=>e.check(Wd(r0,n)),e.base64=(n)=>e.check(Kd(h0,n)),e.base64url=(n)=>e.check(jd(d0,n)),e.xid=(n)=>e.check($d(s0,n)),e.ksuid=(n)=>e.check(Zd(o0,n)),e.ipv4=(n)=>e.check(Xd(a0,n)),e.ipv6=(n)=>e.check(qd(c0,n)),e.cidrv4=(n)=>e.check(Yd(l0,n)),e.cidrv6=(n)=>e.check(Jd(u0,n)),e.e164=(n)=>e.check(Qd(f0,n)),e.datetime=(n)=>e.check(Df(n)),e.date=(n)=>e.check(Uf(n)),e.time=(n)=>e.check(Of(n)),e.duration=(n)=>e.check(Ff(n))});function xt(e){return Nd(K_,e)}var gt=K("ZodStringFormat",(e,t)=>{mt.init(e,t),ip.init(e,t)}),j_=K("ZodEmail",(e,t)=>{Hh.init(e,t),gt.init(e,t)});var Kf=K("ZodGUID",(e,t)=>{Bh.init(e,t),gt.init(e,t)});var io=K("ZodUUID",(e,t)=>{Gh.init(e,t),gt.init(e,t)});var Q_=K("ZodURL",(e,t)=>{Vh.init(e,t),gt.init(e,t)});var e0=K("ZodEmoji",(e,t)=>{Wh.init(e,t),gt.init(e,t)});var t0=K("ZodNanoID",(e,t)=>{$h.init(e,t),gt.init(e,t)});var n0=K("ZodCUID",(e,t)=>{Zh.init(e,t),gt.init(e,t)});var i0=K("ZodCUID2",(e,t)=>{Xh.init(e,t),gt.init(e,t)});var r0=K("ZodULID",(e,t)=>{qh.init(e,t),gt.init(e,t)});var s0=K("ZodXID",(e,t)=>{Yh.init(e,t),gt.init(e,t)});var o0=K("ZodKSUID",(e,t)=>{Jh.init(e,t),gt.init(e,t)});var a0=K("ZodIPv4",(e,t)=>{td.init(e,t),gt.init(e,t)});var c0=K("ZodIPv6",(e,t)=>{nd.init(e,t),gt.init(e,t)});var l0=K("ZodCIDRv4",(e,t)=>{id.init(e,t),gt.init(e,t)});var u0=K("ZodCIDRv6",(e,t)=>{rd.init(e,t),gt.init(e,t)});var h0=K("ZodBase64",(e,t)=>{od.init(e,t),gt.init(e,t)});var d0=K("ZodBase64URL",(e,t)=>{ad.init(e,t),gt.init(e,t)});var f0=K("ZodE164",(e,t)=>{cd.init(e,t),gt.init(e,t)});var p0=K("ZodJWT",(e,t)=>{ld.init(e,t),gt.init(e,t)});var rp=K("ZodNumber",(e,t)=>{Ia.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(i,r,s)=>gf(e,i,r,s),Kr(e,"ZodNumber",{gt(i,r){return this.check(js(i,r))},gte(i,r){return this.check(Yr(i,r))},min(i,r){return this.check(Yr(i,r))},lt(i,r){return this.check(Ks(i,r))},lte(i,r){return this.check(qr(i,r))},max(i,r){return this.check(qr(i,r))},int(i){return this.check(jf(i))},safe(i){return this.check(jf(i))},positive(i){return this.check(js(0,i))},nonnegative(i){return this.check(Yr(0,i))},negative(i){return this.check(Ks(0,i))},nonpositive(i){return this.check(qr(0,i))},multipleOf(i,r){return this.check(Qs(i,r))},step(i,r){return this.check(Qs(i,r))},finite(){return this}});let n=e._zod.bag;e.minValue=Math.max(n.minimum??Number.NEGATIVE_INFINITY,n.exclusiveMinimum??Number.NEGATIVE_INFINITY)??null,e.maxValue=Math.min(n.maximum??Number.POSITIVE_INFINITY,n.exclusiveMaximum??Number.POSITIVE_INFINITY)??null,e.isInt=(n.format??"").includes("int")||Number.isSafeInteger(n.multipleOf??0.5),e.isFinite=!0,e.format=n.format??null});function Xe(e){return of(rp,e)}var m0=K("ZodNumberFormat",(e,t)=>{ud.init(e,t),rp.init(e,t)});function jf(e){return af(m0,e)}var g0=K("ZodBoolean",(e,t)=>{hd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>_f(e,n,i,r)});function _0(e){return cf(g0,e)}var x0=K("ZodUnknown",(e,t)=>{dd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>vf(e,n,i,r)});function Qf(){return lf(x0)}var v0=K("ZodNever",(e,t)=>{fd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>xf(e,n,i,r)});function sp(e){return uf(v0,e)}var y0=K("ZodArray",(e,t)=>{pd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Mf(e,n,i,r),e.element=t.element,Kr(e,"ZodArray",{min(n,i){return this.check(cr(n,i))},nonempty(n){return this.check(cr(1,n))},max(n,i){return this.check(eo(n,i))},length(n,i){return this.check(to(n,i))},unwrap(){return this.element}})});function pi(e,t){return hf(y0,e,t)}var S0=K("ZodObject",(e,t)=>{_d.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>wf(e,n,i,r),rt(e,"shape",()=>t.shape),Kr(e,"ZodObject",{keyof(){return Fi(Object.keys(this._zod.def.shape))},catchall(n){return this.clone({...this._zod.def,catchall:n})},passthrough(){return this.clone({...this._zod.def,catchall:Qf()})},loose(){return this.clone({...this._zod.def,catchall:Qf()})},strict(){return this.clone({...this._zod.def,catchall:sp()})},strip(){return this.clone({...this._zod.def,catchall:void 0})},extend(n){return w_(this,n)},safeExtend(n){return T_(this,n)},merge(n){return E_(this,n)},pick(n){return b_(this,n)},omit(n){return M_(this,n)},partial(...n){return A_(op,this,n[0])},required(...n){return R_(ap,this,n[0])}})});function Pn(e,t){return new S0({type:"object",shape:e,catchall:sp(),...Ae(t)})}var b0=K("ZodUnion",(e,t)=>{xd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Tf(e,n,i,r),e.options=t.options});function M0(e,t){return new b0({type:"union",options:e,...Ae(t)})}var w0=K("ZodIntersection",(e,t)=>{vd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Ef(e,n,i,r)});function T0(e,t){return new w0({type:"intersection",left:e,right:t})}var qa=K("ZodEnum",(e,t)=>{yd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(i,r,s)=>yf(e,i,r,s),e.enum=t.entries,e.options=Object.values(t.entries);let n=new Set(Object.keys(t.entries));e.extract=(i,r)=>{let s={};for(let o of i)if(n.has(o))s[o]=t.entries[o];else throw Error(`Key ${o} not found in enum`);return new qa({...t,checks:[],...Ae(r),entries:s})},e.exclude=(i,r)=>{let s={...t.entries};for(let o of i)if(n.has(o))delete s[o];else throw Error(`Key ${o} not found in enum`);return new qa({...t,checks:[],...Ae(r),entries:s})}});function Fi(e,t){let n=Array.isArray(e)?Object.fromEntries(e.map((i)=>[i,i])):e;return new qa({type:"enum",entries:n,...Ae(t)})}var E0=K("ZodTransform",(e,t)=>{Sd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>bf(e,n,i,r),e._zod.parse=(n,i)=>{if(i.direction==="backward")throw new Hr(e.constructor.name);n.addIssue=(s)=>{if(typeof s==="string")n.issues.push(Ui(s,n.value,t));else{let o=s;if(o.fatal)o.continue=!1;o.code??(o.code="custom"),o.input??(o.input=n.value),o.inst??(o.inst=e),n.issues.push(Ui(o))}};let r=t.transform(n.value,n);if(r instanceof Promise)return r.then((s)=>(n.value=s,n.fallback=!0,n));return n.value=r,n.fallback=!0,n}});function A0(e){return new E0({type:"transform",transform:e})}var op=K("ZodOptional",(e,t)=>{Pa.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Xa(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function ep(e){return new op({type:"optional",innerType:e})}var R0=K("ZodExactOptional",(e,t)=>{bd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Xa(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function C0(e){return new R0({type:"optional",innerType:e})}var I0=K("ZodNullable",(e,t)=>{Md.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Af(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function tp(e){return new I0({type:"nullable",innerType:e})}var P0=K("ZodDefault",(e,t)=>{wd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Cf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType,e.removeDefault=e.unwrap});function L0(e,t){return new P0({type:"default",innerType:e,get defaultValue(){return typeof t==="function"?t():ba(t)}})}var N0=K("ZodPrefault",(e,t)=>{Td.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>If(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function D0(e,t){return new N0({type:"prefault",innerType:e,get defaultValue(){return typeof t==="function"?t():ba(t)}})}var ap=K("ZodNonOptional",(e,t)=>{Ed.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Rf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function U0(e,t){return new ap({type:"nonoptional",innerType:e,...Ae(t)})}var O0=K("ZodCatch",(e,t)=>{Ad.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Pf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType,e.removeCatch=e.unwrap});function F0(e,t){return new O0({type:"catch",innerType:e,catchValue:typeof t==="function"?t:()=>t})}var z0=K("ZodPipe",(e,t)=>{Rd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Lf(e,n,i,r),e.in=t.in,e.out=t.out});function np(e,t){return new z0({type:"pipe",in:e,out:t})}var k0=K("ZodReadonly",(e,t)=>{Cd.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Nf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function B0(e){return new k0({type:"readonly",innerType:e})}var G0=K("ZodCustom",(e,t)=>{Id.init(e,t),wt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Sf(e,n,i,r)});function H0(e,t={}){return df(G0,e,t)}function V0(e,t){return ff(e,t)}var W0={spark:"M12 1 L15 9 L23 12 L15 15 L12 23 L9 15 L1 12 L9 9 Z",play:"M5 2 L22 12 L5 22 Z",heart:"M12 22 C-10 8 1-5 12 5 C23-5 34 8 12 22 Z",check:"M1 12 L9 20 L23 3 L20 1 L9 15 L4 9 Z",arrow:"M1 9 L15 9 L10 4 L13 1 L24 12 L13 23 L10 20 L15 15 L1 15 Z"};function ro(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;")}function cp(e,t,n,i,r={}){let s=[];for(let o of e){if(t<o.start||t>=o.end)continue;let a=t-o.start,c=2*Math.PI*o.bpm/60*a,l=o.x*n,u=o.y*i,d=Math.max(0,Math.min(1,a/0.4,(o.end-t)/0.4)),h=1,f=0;if(o.animation==="slide")l-=n*(1-Math.min(1,a/0.6));if(o.animation==="pulse")h=0.85+0.15*Math.sin(c),d=0.6+0.4*Math.sin(c);if(o.animation==="bounce")u-=i*0.08*Math.abs(Math.sin(c));if(o.animation==="rotate")f=a*o.bpm*6;let g=o.font_size,S="";if(o.kind==="icon")S=`<path transform="translate(${-g/2},${-g/2}) scale(${g/24})" d="${W0[o.icon]}"/>`;else if(o.kind==="shape"){let p=o.shape==="circle"?g/2:0;if(o.animation==="morph")p=g/4*(1+Math.sin(c));S=`<rect x="${-g/2}" y="${-g/2}" width="${g}" height="${g}" rx="${p}"/>`}else if(o.kind==="image"){let p=r[o.imageMediaId||""];if(p&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p))S=`<image x="${-g/2}" y="${-g/2}" width="${g}" height="${g}" href="${ro(p)}" preserveAspectRatio="xMidYMid meet"/>`}else{let p=o.text.split(`
`);S=`<text text-anchor="middle" dominant-baseline="middle" font-family="${o.font_family==="serif"?"Noto Serif CJK SC,SimSun,serif":"Arial,Microsoft YaHei,Noto Sans CJK SC,sans-serif"}" font-size="${g}">${p.map((T,A)=>`<tspan x="0" dy="${A===0?-(p.length-1)*g*0.6:g*1.2}">${ro(T)}</tspan>`).join("")}</text>`}s.push(`<g data-studio-graphic-id="${ro(o.id)}" transform="translate(${l},${u}) rotate(${f}) scale(${h})" fill="${ro(o.color)}" opacity="${d}">${S}</g>`)}return`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${i}" viewBox="0 0 ${n} ${i}">${s.join("")}</svg>`}var lp=Pn({id:xt().min(1).max(128),kind:Fi(["text","icon","shape","image"]).default("text"),text:xt().min(1).max(2000),icon:Fi(["spark","play","heart","check","arrow"]).default("spark"),shape:Fi(["square","circle"]).default("square"),imageMediaId:xt().min(1).max(128).optional(),start:Xe().min(0).max(3600),end:Xe().min(0.01).max(3600),x:Xe().min(0).max(1),y:Xe().min(0).max(1),font_size:Xe().int().min(12).max(300),font_family:Fi(["sans","serif"]).optional(),color:xt().regex(/^#[0-9a-fA-F]{6}$/),animation:Fi(["fade","slide","pulse","bounce","rotate","morph"]),bpm:Xe().int().min(30).max(240)}).refine((e)=>e.end>e.start,{message:"End must follow start"}).refine((e)=>e.animation!=="morph"||e.kind==="shape",{message:"Morph animation requires a shape"}).refine((e)=>e.kind!=="image"||Boolean(e.imageMediaId),{message:"Image graphics require a stored image"});var up=Pn({advanced:Pn({exports:pi(Pn({modelMediaId:xt().max(128),title:xt().max(200),createdAt:xt().max(40)})).max(50).optional(),models:pi(Pn({id:xt().max(128),title:xt().max(200),modelMediaId:xt().max(128),x:Xe().min(-10).max(10),assetId:xt().max(128).optional(),assetVersionId:xt().max(128).optional(),y:Xe().min(-10).max(10),z:Xe().min(-10).max(10),scale:Xe().min(0.01).max(10).default(1),yaw:Xe().min(-180).max(180).optional(),pitch:Xe().min(-180).max(180).optional(),roll:Xe().min(-180).max(180).optional(),animation:xt().max(200).default("")})).max(12).default([]),tracks:pi(Pn({targetId:xt().max(128),keys:pi(Pn({time:Xe().min(0).max(30),x:Xe().min(-100).max(100),y:Xe().min(-100).max(100),z:Xe().min(-100).max(100),yaw:Xe().min(-180).max(180)})).max(100)})).max(45).default([]),followId:xt().max(128).optional(),lookAtId:xt().max(128).optional(),showPaths:_0().default(!0)}).optional(),duration:Xe().min(1).max(30).default(5),camera:Pn({yaw:Xe().min(-180).max(180).default(20),endYaw:Xe().min(-180).max(180).default(20),pitch:Xe().min(5).max(80).default(20),distance:Xe().min(3).max(30).default(10),fov:Xe().min(20).max(100).default(50)}).default({yaw:20,endYaw:20,pitch:20,distance:10,fov:50}),actors:pi(Pn({id:xt().min(1).max(128),assetId:xt().max(128).optional(),title:xt().max(200),x:Xe().min(-10).max(10),z:Xe().min(-10).max(10),endX:Xe().min(-10).max(10),endZ:Xe().min(-10).max(10),yaw:Xe().min(-180).max(180).default(0),pose:Fi(["stand","walk","wave","point","sit"]).default("stand"),color:xt().regex(/^#[0-9a-fA-F]{6}$/).default("#8ab4f8")})).max(12).default([]),props:pi(Pn({id:xt().min(1).max(128),title:xt().max(200),x:Xe().min(-10).max(10),z:Xe().min(-10).max(10),width:Xe().min(0.1).max(5),height:Xe().min(0.1).max(5),depth:Xe().min(0.1).max(5),color:xt().regex(/^#[0-9a-fA-F]{6}$/).default("#e6ad72")})).max(20).default([])}).superRefine((e,t)=>{let n=new Set(["__camera__"]);for(let s of[...e.actors,...e.props,...e.advanced?.models||[]]){if(!s.id||n.has(s.id))t.addIssue({code:"custom",message:"Stage objects require unique IDs; the camera ID is reserved"});n.add(s.id)}let i=e.advanced;if(!i)return;for(let s of[i.followId,i.lookAtId])if(s&&(!n.has(s)||s==="__camera__"))t.addIssue({code:"custom",message:"Camera targets must exist in the stage"});let r=new Set;for(let s of i.tracks){if(!n.has(s.targetId)||r.has(s.targetId))t.addIssue({code:"custom",message:"Tracks need unique existing targets"});r.add(s.targetId);let o=new Set;for(let a of s.keys){if(o.has(a.time)||a.time>e.duration)t.addIssue({code:"custom",message:"Keyframe times must be unique and within the scene"});o.add(a.time)}}});var Jp="186";var Kp=0,bc=1,jp=2;var ls=1,Qp=2,Er=3,bi=0,jt=1,pn=2,Dn=0,us=1,Mc=2,wc=3,Tc=4,em=5;var Ar=100,tm=101,nm=102,im=103,rm=104,sm=200,om=201,am=202,cm=203,lm=204,um=205,hm=206,dm=207,fm=208,pm=209,mm=210,gm=211,_m=212,xm=213,vm=214,ym=0,Sm=1,bm=2,Ec=3,Mm=4,wm=5,Tm=6,Em=7,Am=0,Rm=1,Cm=2,wn=0,Ac=1,Rc=2,Cc=3,Ic=4,Pc=5,Lc=6,Nc=7;var Rr=301,Wi=302,Do=303,Uo=304,hs=306,Cr=1000,Ir=1001,Oo=1002,Tn=1003,Fo=1004;var $i=1005;var zt=1006,Pr=1007;var Un=1008;var En=1009,Im=1010,Pm=1011,ds=1012,Dc=1013,Mi=1014,si=1015,On=1016,Uc=1017,Oc=1018,Lr=1020,Lm=35902,Nm=35899,Dm=1021,Um=1022,Fn=1023,Zi=1026,Xi=1027,Om=1028,Fc=1029,qi=1030,zc=1031;var kc=1033,zo=33776,ko=33777,Bo=33778,Go=33779,Bc=35840,Gc=35841,Hc=35842,Vc=35843,Wc=36196,$c=37492,Zc=37496,Xc=37488,qc=37489,Ho=37490,Yc=37491,Jc=37808,Kc=37809,jc=37810,Qc=37811,el=37812,tl=37813,nl=37814,il=37815,rl=37816,sl=37817,ol=37818,al=37819,cl=37820,ll=37821,ul=36492,hl=36494,dl=36495,fl=36283,pl=36284,Vo=36285,ml=36286;var gl=2300,Wo=2301;var _l=0,fs=1,Nr=2,xl=3200;var vl=0,Fm=1,Yi="",wi="srgb",nn="srgb-linear",yl="linear",lt="srgb";var zm=512,km=513,Bm=514,$o=515,Gm=516,Hm=517,Zo=518,Vm=519;var Sl="300 es",bl=2000;function $0(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function Z0(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function wr(e){return document.createElementNS("http://www.w3.org/1999/xhtml",e)}function Wm(){let e=wr("canvas");return e.style.display="block",e}var hp={},Tr=null;function cs(...e){let t="THREE."+e.shift();if(Tr)Tr("log",t,...e);else console.log(t,...e)}function $m(e){let t=e[0];if(typeof t==="string"&&t.startsWith("TSL:")){let n=e[1];if(n&&n.isStackTrace)e[0]+=" "+n.getLocation();else e[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return e}function Te(...e){e=$m(e);let t="THREE."+e.shift();if(Tr)Tr("warn",t,...e);else{let n=e[0];if(n&&n.isStackTrace)console.warn(n.getError(t));else console.warn(t,...e)}}function De(...e){e=$m(e);let t="THREE."+e.shift();if(Tr)Tr("error",t,...e);else{let n=e[0];if(n&&n.isStackTrace)console.error(n.getError(t));else console.error(t,...e)}}function Hi(...e){let t=e.join(" ");if(t in hp)return;hp[t]=!0,Te(...e)}function Zm(e,t,n){return new Promise(function(i,r){function s(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:r();break;case e.TIMEOUT_EXPIRED:setTimeout(s,n);break;default:i()}}setTimeout(s,n)})}var Xm={[0]:1,[2]:6,[4]:7,[3]:5,[1]:0,[6]:2,[7]:4,[5]:3};class zn{addEventListener(e,t){if(this._listeners===void 0)this._listeners={};let n=this._listeners;if(n[e]===void 0)n[e]=[];if(n[e].indexOf(t)===-1)n[e].push(t)}hasEventListener(e,t){let n=this._listeners;if(n===void 0)return!1;return n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let i=n[e];if(i!==void 0){let r=i.indexOf(t);if(r!==-1)i.splice(r,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let i=n.slice(0);for(let r=0,s=i.length;r<s;r++)i[r].call(this,e);e.target=null}}}var Vt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],dp=1234567,os=Math.PI/180,Vi=180/Math.PI;function Mn(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(Vt[e&255]+Vt[e>>8&255]+Vt[e>>16&255]+Vt[e>>24&255]+"-"+Vt[t&255]+Vt[t>>8&255]+"-"+Vt[t>>16&15|64]+Vt[t>>24&255]+"-"+Vt[n&63|128]+Vt[n>>8&255]+"-"+Vt[n>>16&255]+Vt[n>>24&255]+Vt[i&255]+Vt[i>>8&255]+Vt[i>>16&255]+Vt[i>>24&255]).toLowerCase()}function $e(e,t,n){return Math.max(t,Math.min(n,e))}function Ml(e,t){return(e%t+t)%t}function X0(e,t,n,i,r){return i+(e-t)*(r-i)/(n-t)}function q0(e,t,n){if(e!==t)return(n-e)/(t-e);else return 0}function as(e,t,n){return(1-n)*e+n*t}function Y0(e,t,n,i){return as(e,t,1-Math.exp(-n*i))}function J0(e,t=1){return t-Math.abs(Ml(e,t*2)-t)}function K0(e,t,n){if(e<=t)return 0;if(e>=n)return 1;return e=(e-t)/(n-t),e*e*(3-2*e)}function j0(e,t,n){if(e<=t)return 0;if(e>=n)return 1;return e=(e-t)/(n-t),e*e*e*(e*(e*6-15)+10)}function Q0(e,t){return e+Math.floor(Math.random()*(t-e+1))}function ex(e,t){return e+Math.random()*(t-e)}function tx(e){return e*(0.5-Math.random())}function nx(e){if(e!==void 0)dp=e;let t=dp+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function ix(e){return e*os}function rx(e){return e*Vi}function sx(e){return e>0&&Number.isInteger(e)&&2**Math.round(Math.log2(e))===e}function ox(e){return Math.pow(2,Math.ceil(Math.log(e)/Math.LN2))}function ax(e){return Math.pow(2,Math.floor(Math.log(e)/Math.LN2))}function cx(e,t,n,i,r){let{cos:s,sin:o}=Math,a=s(n/2),c=o(n/2),l=s((t+i)/2),u=o((t+i)/2),d=s((t-i)/2),h=o((t-i)/2),f=s((i-t)/2),g=o((i-t)/2);switch(r){case"XYX":e.set(a*u,c*d,c*h,a*l);break;case"YZY":e.set(c*h,a*u,c*d,a*l);break;case"ZXZ":e.set(c*d,c*h,a*u,a*l);break;case"XZX":e.set(a*u,c*g,c*f,a*l);break;case"YXY":e.set(c*f,a*u,c*g,a*l);break;case"ZYZ":e.set(c*g,c*f,a*u,a*l);break;default:Te("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+r)}}function bn(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:case Uint8ClampedArray:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error("THREE.MathUtils: Invalid component type.")}}function st(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error("THREE.MathUtils: Invalid component type.")}}var mn={DEG2RAD:os,RAD2DEG:Vi,generateUUID:Mn,clamp:$e,euclideanModulo:Ml,mapLinear:X0,inverseLerp:q0,lerp:as,damp:Y0,pingpong:J0,smoothstep:K0,smootherstep:j0,randInt:Q0,randFloat:ex,randFloatSpread:tx,seededRandom:nx,degToRad:ix,radToDeg:rx,isPowerOfTwo:sx,ceilPowerOfTwo:ox,floorPowerOfTwo:ax,setQuaternionFromProperEuler:cx,normalize:st,denormalize:bn};class ze{static{ze.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=$e(this.x,e.x,t.x),this.y=$e(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=$e(this.x,e,t),this.y=$e(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar($e(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos($e(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),i=Math.sin(t),r=this.x-e.x,s=this.y-e.y;return this.x=r*n-s*i+e.x,this.y=r*i+s*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Gt{constructor(e=0,t=0,n=0,i=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=i}static slerpFlat(e,t,n,i,r,s,o){let a=n[i+0],c=n[i+1],l=n[i+2],u=n[i+3],d=r[s+0],h=r[s+1],f=r[s+2],g=r[s+3];if(u!==g||a!==d||c!==h||l!==f){let S=a*d+c*h+l*f+u*g;if(S<0)d=-d,h=-h,f=-f,g=-g,S=-S;let p=1-o;if(S<0.9995){let m=Math.acos(S),T=Math.sin(m);p=Math.sin(p*m)/T,o=Math.sin(o*m)/T,a=a*p+d*o,c=c*p+h*o,l=l*p+f*o,u=u*p+g*o}else{a=a*p+d*o,c=c*p+h*o,l=l*p+f*o,u=u*p+g*o;let m=1/Math.sqrt(a*a+c*c+l*l+u*u);a*=m,c*=m,l*=m,u*=m}}e[t]=a,e[t+1]=c,e[t+2]=l,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,i,r,s){let o=n[i],a=n[i+1],c=n[i+2],l=n[i+3],u=r[s],d=r[s+1],h=r[s+2],f=r[s+3];return e[t]=o*f+l*u+a*h-c*d,e[t+1]=a*f+l*d+c*u-o*h,e[t+2]=c*f+l*h+o*d-a*u,e[t+3]=l*f-o*u-a*d-c*h,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let{_x:n,_y:i,_z:r,_order:s}=e,{cos:o,sin:a}=Math,c=o(n/2),l=o(i/2),u=o(r/2),d=a(n/2),h=a(i/2),f=a(r/2);switch(s){case"XYZ":this._x=d*l*u+c*h*f,this._y=c*h*u-d*l*f,this._z=c*l*f+d*h*u,this._w=c*l*u-d*h*f;break;case"YXZ":this._x=d*l*u+c*h*f,this._y=c*h*u-d*l*f,this._z=c*l*f-d*h*u,this._w=c*l*u+d*h*f;break;case"ZXY":this._x=d*l*u-c*h*f,this._y=c*h*u+d*l*f,this._z=c*l*f+d*h*u,this._w=c*l*u-d*h*f;break;case"ZYX":this._x=d*l*u-c*h*f,this._y=c*h*u+d*l*f,this._z=c*l*f-d*h*u,this._w=c*l*u+d*h*f;break;case"YZX":this._x=d*l*u+c*h*f,this._y=c*h*u+d*l*f,this._z=c*l*f-d*h*u,this._w=c*l*u-d*h*f;break;case"XZY":this._x=d*l*u-c*h*f,this._y=c*h*u-d*l*f,this._z=c*l*f+d*h*u,this._w=c*l*u+d*h*f;break;default:Te("Quaternion: .setFromEuler() encountered an unknown order: "+s)}if(t===!0)this._onChangeCallback();return this}setFromAxisAngle(e,t){let n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],i=t[4],r=t[8],s=t[1],o=t[5],a=t[9],c=t[2],l=t[6],u=t[10],d=n+o+u;if(d>0){let h=0.5/Math.sqrt(d+1);this._w=0.25/h,this._x=(l-a)*h,this._y=(r-c)*h,this._z=(s-i)*h}else if(n>o&&n>u){let h=2*Math.sqrt(1+n-o-u);this._w=(l-a)/h,this._x=0.25*h,this._y=(i+s)/h,this._z=(r+c)/h}else if(o>u){let h=2*Math.sqrt(1+o-n-u);this._w=(r-c)/h,this._x=(i+s)/h,this._y=0.25*h,this._z=(a+l)/h}else{let h=2*Math.sqrt(1+u-n-o);this._w=(s-i)/h,this._x=(r+c)/h,this._y=(a+l)/h,this._z=0.25*h}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;if(n<0.00000001)if(n=0,Math.abs(e.x)>Math.abs(e.z))this._x=-e.y,this._y=e.x,this._z=0,this._w=n;else this._x=0,this._y=-e.z,this._z=e.y,this._w=n;else this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n;return this.normalize()}angleTo(e){return 2*Math.acos(Math.abs($e(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();if(e===0)this._x=0,this._y=0,this._z=0,this._w=1;else e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e;return this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let{_x:n,_y:i,_z:r,_w:s}=e,{_x:o,_y:a,_z:c,_w:l}=t;return this._x=n*l+s*o+i*c-r*a,this._y=i*l+s*a+r*o-n*c,this._z=r*l+s*c+n*a-i*o,this._w=s*l-n*o-i*a-r*c,this._onChangeCallback(),this}slerp(e,t){let{_x:n,_y:i,_z:r,_w:s}=e,o=this.dot(e);if(o<0)n=-n,i=-i,r=-r,s=-s,o=-o;let a=1-t;if(o<0.9995){let c=Math.acos(o),l=Math.sin(c);a=Math.sin(a*c)/l,t=Math.sin(t*c)/l,this._x=this._x*a+n*t,this._y=this._y*a+i*t,this._z=this._z*a+r*t,this._w=this._w*a+s*t,this._onChangeCallback()}else this._x=this._x*a+n*t,this._y=this._y*a+i*t,this._z=this._z*a+r*t,this._w=this._w*a+s*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(e),i*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class O{static{O.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){if(n===void 0)n=this.z;return this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(fp.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(fp.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*i,this.y=r[1]*t+r[4]*n+r[7]*i,this.z=r[2]*t+r[5]*n+r[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=e.elements,s=1/(r[3]*t+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*i+r[12])*s,this.y=(r[1]*t+r[5]*n+r[9]*i+r[13])*s,this.z=(r[2]*t+r[6]*n+r[10]*i+r[14])*s,this}applyQuaternion(e){let t=this.x,n=this.y,i=this.z,{x:r,y:s,z:o,w:a}=e,c=2*(s*i-o*n),l=2*(o*t-r*i),u=2*(r*n-s*t);return this.x=t+a*c+s*u-o*l,this.y=n+a*l+o*c-r*u,this.z=i+a*u+r*l-s*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*i,this.y=r[1]*t+r[5]*n+r[9]*i,this.z=r[2]*t+r[6]*n+r[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=$e(this.x,e.x,t.x),this.y=$e(this.y,e.y,t.y),this.z=$e(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=$e(this.x,e,t),this.y=$e(this.y,e,t),this.z=$e(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar($e(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let{x:n,y:i,z:r}=e,{x:s,y:o,z:a}=t;return this.x=i*a-r*o,this.y=r*s-n*a,this.z=n*o-i*s,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Ja.copy(this).projectOnVector(e),this.sub(Ja)}reflect(e){return this.sub(Ja.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos($e(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}var Ja=new O,fp=new Gt;class Ue{static{Ue.prototype.isMatrix3=!0}constructor(e,t,n,i,r,s,o,a,c){if(this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0)this.set(e,t,n,i,r,s,o,a,c)}set(e,t,n,i,r,s,o,a,c){let l=this.elements;return l[0]=e,l[1]=i,l[2]=o,l[3]=t,l[4]=r,l[5]=a,l[6]=n,l[7]=s,l[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,s=n[0],o=n[3],a=n[6],c=n[1],l=n[4],u=n[7],d=n[2],h=n[5],f=n[8],g=i[0],S=i[3],p=i[6],m=i[1],T=i[4],A=i[7],v=i[2],w=i[5],E=i[8];return r[0]=s*g+o*m+a*v,r[3]=s*S+o*T+a*w,r[6]=s*p+o*A+a*E,r[1]=c*g+l*m+u*v,r[4]=c*S+l*T+u*w,r[7]=c*p+l*A+u*E,r[2]=d*g+h*m+f*v,r[5]=d*S+h*T+f*w,r[8]=d*p+h*A+f*E,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],s=e[4],o=e[5],a=e[6],c=e[7],l=e[8];return t*s*l-t*o*c-n*r*l+n*o*a+i*r*c-i*s*a}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],s=e[4],o=e[5],a=e[6],c=e[7],l=e[8],u=l*s-o*c,d=o*a-l*r,h=c*r-s*a,f=t*u+n*d+i*h;if(f===0)return this.set(0,0,0,0,0,0,0,0,0);let g=1/f;return e[0]=u*g,e[1]=(i*c-l*n)*g,e[2]=(o*n-i*s)*g,e[3]=d*g,e[4]=(l*t-i*a)*g,e[5]=(i*r-o*t)*g,e[6]=h*g,e[7]=(n*a-c*t)*g,e[8]=(s*t-n*r)*g,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,r,s,o){let a=Math.cos(r),c=Math.sin(r);return this.set(n*a,n*c,-n*(a*s+c*o)+s+e,-i*c,i*a,-i*(-c*s+a*o)+o+t,0,0,1),this}scale(e,t){return Hi("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Ka.makeScale(e,t)),this}rotate(e){return Hi("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Ka.makeRotation(-e)),this}translate(e,t){return Hi("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Ka.makeTranslation(e,t)),this}makeTranslation(e,t){if(e.isVector2)this.set(1,0,e.x,0,1,e.y,0,0,1);else this.set(1,0,e,0,1,t,0,0,1);return this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}}var Ka=new Ue,pp=new Ue().set(0.4123908,0.3575843,0.1804808,0.212639,0.7151687,0.0721923,0.0193308,0.1191948,0.9505322),mp=new Ue().set(3.2409699,-1.5373832,-0.4986108,-0.9692436,1.8759675,0.0415551,0.0556301,-0.203977,1.0569715);function lx(){let e={enabled:!0,workingColorSpace:"srgb-linear",spaces:{},convert:function(r,s,o){if(this.enabled===!1||s===o||!s||!o)return r;if(this.spaces[s].transfer==="srgb")r.r=ni(r.r),r.g=ni(r.g),r.b=ni(r.b);if(this.spaces[s].primaries!==this.spaces[o].primaries)r.applyMatrix3(this.spaces[s].toXYZ),r.applyMatrix3(this.spaces[o].fromXYZ);if(this.spaces[o].transfer==="srgb")r.r=Mr(r.r),r.g=Mr(r.g),r.b=Mr(r.b);return r},workingToColorSpace:function(r,s){return this.convert(r,this.workingColorSpace,s)},colorSpaceToWorking:function(r,s){return this.convert(r,s,this.workingColorSpace)},getPrimaries:function(r){return this.spaces[r].primaries},getTransfer:function(r){if(r==="")return"linear";return this.spaces[r].transfer},getToneMappingMode:function(r){return this.spaces[r].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(r,s=this.workingColorSpace){return r.fromArray(this.spaces[s].luminanceCoefficients)},define:function(r){Object.assign(this.spaces,r)},_getMatrix:function(r,s,o){return r.copy(this.spaces[s].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(r){return this.spaces[r].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(r=this.workingColorSpace){return this.spaces[r].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(r,s){return Hi("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),e.workingToColorSpace(r,s)},toWorkingColorSpace:function(r,s){return Hi("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),e.colorSpaceToWorking(r,s)}},t=[0.64,0.33,0.3,0.6,0.15,0.06],n=[0.2126,0.7152,0.0722],i=[0.3127,0.329];return e.define({["srgb-linear"]:{primaries:t,whitePoint:i,transfer:"linear",toXYZ:pp,fromXYZ:mp,luminanceCoefficients:n,workingColorSpaceConfig:{unpackColorSpace:"srgb"},outputColorSpaceConfig:{drawingBufferColorSpace:"srgb"}},["srgb"]:{primaries:t,whitePoint:i,transfer:"srgb",toXYZ:pp,fromXYZ:mp,luminanceCoefficients:n,outputColorSpaceConfig:{drawingBufferColorSpace:"srgb"}}}),e}var He=lx();function ni(e){return e<0.04045?e*0.0773993808:Math.pow(e*0.9478672986+0.0521327014,2.4)}function Mr(e){return e<0.0031308?e*12.92:1.055*Math.pow(e,0.41666)-0.055}var lr;class wl{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src))return e.src;if(typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{if(lr===void 0)lr=wr("canvas");lr.width=e.width,lr.height=e.height;let i=lr.getContext("2d");if(e instanceof ImageData)i.putImageData(e,0,0);else i.drawImage(e,0,0,e.width,e.height);n=lr}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=wr("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let i=n.getImageData(0,0,e.width,e.height),r=i.data;for(let s=0;s<r.length;s++)r[s]=ni(r[s]/255)*255;return n.putImageData(i,0,0),t}else if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)if(t instanceof Uint8Array||t instanceof Uint8ClampedArray)t[n]=Math.floor(ni(t[n]/255)*255);else t[n]=ni(t[n]);return{data:t,width:e.width,height:e.height}}else return Te("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}var ux=0;class ps{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:ux++}),this.uuid=Mn(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;if(typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement)e.set(t.videoWidth,t.videoHeight,0);else if(typeof VideoFrame<"u"&&t instanceof VideoFrame)e.set(t.displayWidth,t.displayHeight,0);else if(t!==null)e.set(t.width,t.height,t.depth||0);else e.set(0,0,0);return e}set needsUpdate(e){if(e===!0)this.version++}toJSON(e){let t=e===void 0||typeof e==="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let s=0,o=i.length;s<o;s++)if(i[s].isDataTexture)r.push(ja(i[s].image));else r.push(ja(i[s]))}else r=ja(i);n.url=r}if(!t)e.images[this.uuid]=n;return n}}function ja(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap)return wl.getDataURL(e);else if(e.data)return{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name};else return Te("Texture: Unable to serialize Texture."),{}}var hx=0,Qa=new O;class St extends zn{constructor(e=St.DEFAULT_IMAGE,t=St.DEFAULT_MAPPING,n=1001,i=1001,r=1006,s=1008,o=1023,a=1009,c=St.DEFAULT_ANISOTROPY,l=""){super();this.isTexture=!0,Object.defineProperty(this,"id",{value:hx++}),this.uuid=Mn(),this.name="",this.source=new ps(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=s,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=a,this.offset=new ze(0,0),this.repeat=new ze(1,1),this.center=new ze(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ue,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=l,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=e&&e.depth&&e.depth>1?!0:!1,this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(Qa).x}get height(){return this.source.getSize(Qa).y}get depth(){return this.source.getSize(Qa).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){Te(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let i=this[t];if(i===void 0){Te(`Texture.setValues(): property '${t}' does not exist.`);continue}if(i&&n&&(i.isVector2&&n.isVector2))i.copy(n);else if(i&&n&&(i.isVector3&&n.isVector3))i.copy(n);else if(i&&n&&(i.isMatrix3&&n.isMatrix3))i.copy(n);else this[t]=n}}toJSON(e){let t=e===void 0||typeof e==="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};if(Object.keys(this.userData).length>0)n.userData=this.userData;if(!t)e.textures[this.uuid]=n;return n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==300)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case 1000:e.x=e.x-Math.floor(e.x);break;case 1001:e.x=e.x<0?0:1;break;case 1002:if(Math.abs(Math.floor(e.x)%2)===1)e.x=Math.ceil(e.x)-e.x;else e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case 1000:e.y=e.y-Math.floor(e.y);break;case 1001:e.y=e.y<0?0:1;break;case 1002:if(Math.abs(Math.floor(e.y)%2)===1)e.y=Math.ceil(e.y)-e.y;else e.y=e.y-Math.floor(e.y);break}if(this.flipY)e.y=1-e.y;return e}set needsUpdate(e){if(e===!0)this.version++,this.source.needsUpdate=!0}set needsPMREMUpdate(e){if(e===!0)this.pmremVersion++}}St.DEFAULT_IMAGE=null;St.DEFAULT_MAPPING=300;St.DEFAULT_ANISOTROPY=1;class ot{static{ot.prototype.isVector4=!0}constructor(e=0,t=0,n=0,i=1){this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=this.w,s=e.elements;return this.x=s[0]*t+s[4]*n+s[8]*i+s[12]*r,this.y=s[1]*t+s[5]*n+s[9]*i+s[13]*r,this.z=s[2]*t+s[6]*n+s[10]*i+s[14]*r,this.w=s[3]*t+s[7]*n+s[11]*i+s[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);if(t<0.0001)this.x=1,this.y=0,this.z=0;else this.x=e.x/t,this.y=e.y/t,this.z=e.z/t;return this}setAxisAngleFromRotationMatrix(e){let t,n,i,r,s=0.01,o=0.1,a=e.elements,c=a[0],l=a[4],u=a[8],d=a[1],h=a[5],f=a[9],g=a[2],S=a[6],p=a[10];if(Math.abs(l-d)<0.01&&Math.abs(u-g)<0.01&&Math.abs(f-S)<0.01){if(Math.abs(l+d)<0.1&&Math.abs(u+g)<0.1&&Math.abs(f+S)<0.1&&Math.abs(c+h+p-3)<0.1)return this.set(1,0,0,0),this;t=Math.PI;let T=(c+1)/2,A=(h+1)/2,v=(p+1)/2,w=(l+d)/4,E=(u+g)/4,R=(f+S)/4;if(T>A&&T>v)if(T<0.01)n=0,i=0.707106781,r=0.707106781;else n=Math.sqrt(T),i=w/n,r=E/n;else if(A>v)if(A<0.01)n=0.707106781,i=0,r=0.707106781;else i=Math.sqrt(A),n=w/i,r=R/i;else if(v<0.01)n=0.707106781,i=0.707106781,r=0;else r=Math.sqrt(v),n=E/r,i=R/r;return this.set(n,i,r,t),this}let m=Math.sqrt((S-f)*(S-f)+(u-g)*(u-g)+(d-l)*(d-l));if(Math.abs(m)<0.001)m=1;return this.x=(S-f)/m,this.y=(u-g)/m,this.z=(d-l)/m,this.w=Math.acos((c+h+p-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=$e(this.x,e.x,t.x),this.y=$e(this.y,e.y,t.y),this.z=$e(this.z,e.z,t.z),this.w=$e(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=$e(this.x,e,t),this.y=$e(this.y,e,t),this.z=$e(this.z,e,t),this.w=$e(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar($e(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class Tl extends zn{constructor(e=1,t=1,n={}){super();n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:1006,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new ot(0,0,e,t),this.scissorTest=!1,this.viewport=new ot(0,0,e,t),this.textures=[];let i={width:e,height:t,depth:n.depth},r=new St(i),s=n.count;for(let o=0;o<s;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:1006,generateMipmaps:!1,flipY:!1,internalFormat:null};if(e.mapping!==void 0)t.mapping=e.mapping;if(e.wrapS!==void 0)t.wrapS=e.wrapS;if(e.wrapT!==void 0)t.wrapT=e.wrapT;if(e.wrapR!==void 0)t.wrapR=e.wrapR;if(e.magFilter!==void 0)t.magFilter=e.magFilter;if(e.minFilter!==void 0)t.minFilter=e.minFilter;if(e.format!==void 0)t.format=e.format;if(e.type!==void 0)t.type=e.type;if(e.anisotropy!==void 0)t.anisotropy=e.anisotropy;if(e.colorSpace!==void 0)t.colorSpace=e.colorSpace;if(e.flipY!==void 0)t.flipY=e.flipY;if(e.generateMipmaps!==void 0)t.generateMipmaps=e.generateMipmaps;if(e.internalFormat!==void 0)t.internalFormat=e.internalFormat;for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){if(this._depthTexture!==null&&this._depthTexture.renderTarget===this)this._depthTexture.renderTarget=null;if(e!==null&&e.renderTarget===null)e.renderTarget=this;this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)if(this.textures[i].image.width=e,this.textures[i].image.height=t,this.textures[i].image.depth=n,this.textures[i].isData3DTexture!==!0)this.textures[i].isArrayTexture=this.textures[i].image.depth>1;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let i=Object.assign({},e.textures[t].image);this.textures[t].source=new ps(i)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null)if(e.depthTexture.renderTarget===e){let t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture;return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class rn extends Tl{constructor(e=1,t=1,n={}){super(e,t,n);this.isWebGLRenderTarget=!0}}class Xo extends St{constructor(e=null,t=1,n=1,i=1){super(null);this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=1003,this.minFilter=1003,this.wrapR=1001,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class El extends St{constructor(e=null,t=1,n=1,i=1){super(null);this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=1003,this.minFilter=1003,this.wrapR=1001,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}}class Oe{static{Oe.prototype.isMatrix4=!0}constructor(e,t,n,i,r,s,o,a,c,l,u,d,h,f,g,S){if(this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0)this.set(e,t,n,i,r,s,o,a,c,l,u,d,h,f,g,S)}set(e,t,n,i,r,s,o,a,c,l,u,d,h,f,g,S){let p=this.elements;return p[0]=e,p[4]=t,p[8]=n,p[12]=i,p[1]=r,p[5]=s,p[9]=o,p[13]=a,p[2]=c,p[6]=l,p[10]=u,p[14]=d,p[3]=h,p[7]=f,p[11]=g,p[15]=S,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Oe().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){if(this.determinantAffine()===0)return e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this;return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,n=e.elements,i=1/ur.setFromMatrixColumn(e,0).length(),r=1/ur.setFromMatrixColumn(e,1).length(),s=1/ur.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*s,t[9]=n[9]*s,t[10]=n[10]*s,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,{x:n,y:i,z:r}=e,s=Math.cos(n),o=Math.sin(n),a=Math.cos(i),c=Math.sin(i),l=Math.cos(r),u=Math.sin(r);if(e.order==="XYZ"){let d=s*l,h=s*u,f=o*l,g=o*u;t[0]=a*l,t[4]=-a*u,t[8]=c,t[1]=h+f*c,t[5]=d-g*c,t[9]=-o*a,t[2]=g-d*c,t[6]=f+h*c,t[10]=s*a}else if(e.order==="YXZ"){let d=a*l,h=a*u,f=c*l,g=c*u;t[0]=d+g*o,t[4]=f*o-h,t[8]=s*c,t[1]=s*u,t[5]=s*l,t[9]=-o,t[2]=h*o-f,t[6]=g+d*o,t[10]=s*a}else if(e.order==="ZXY"){let d=a*l,h=a*u,f=c*l,g=c*u;t[0]=d-g*o,t[4]=-s*u,t[8]=f+h*o,t[1]=h+f*o,t[5]=s*l,t[9]=g-d*o,t[2]=-s*c,t[6]=o,t[10]=s*a}else if(e.order==="ZYX"){let d=s*l,h=s*u,f=o*l,g=o*u;t[0]=a*l,t[4]=f*c-h,t[8]=d*c+g,t[1]=a*u,t[5]=g*c+d,t[9]=h*c-f,t[2]=-c,t[6]=o*a,t[10]=s*a}else if(e.order==="YZX"){let d=s*a,h=s*c,f=o*a,g=o*c;t[0]=a*l,t[4]=g-d*u,t[8]=f*u+h,t[1]=u,t[5]=s*l,t[9]=-o*l,t[2]=-c*l,t[6]=h*u+f,t[10]=d-g*u}else if(e.order==="XZY"){let d=s*a,h=s*c,f=o*a,g=o*c;t[0]=a*l,t[4]=-u,t[8]=c*l,t[1]=d*u+g,t[5]=s*l,t[9]=h*u-f,t[2]=f*u-h,t[6]=o*l,t[10]=g*u+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(dx,e,fx)}lookAt(e,t,n){let i=this.elements;if(en.subVectors(e,t),en.lengthSq()===0)en.z=1;if(en.normalize(),mi.crossVectors(n,en),mi.lengthSq()===0){if(Math.abs(n.z)===1)en.x+=0.0001;else en.z+=0.0001;en.normalize(),mi.crossVectors(n,en)}return mi.normalize(),so.crossVectors(en,mi),i[0]=mi.x,i[4]=so.x,i[8]=en.x,i[1]=mi.y,i[5]=so.y,i[9]=en.y,i[2]=mi.z,i[6]=so.z,i[10]=en.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,s=n[0],o=n[4],a=n[8],c=n[12],l=n[1],u=n[5],d=n[9],h=n[13],f=n[2],g=n[6],S=n[10],p=n[14],m=n[3],T=n[7],A=n[11],v=n[15],w=i[0],E=i[4],R=i[8],x=i[12],M=i[1],H=i[5],U=i[9],z=i[13],N=i[2],C=i[6],F=i[10],V=i[14],G=i[3],ie=i[7],X=i[11],Q=i[15];return r[0]=s*w+o*M+a*N+c*G,r[4]=s*E+o*H+a*C+c*ie,r[8]=s*R+o*U+a*F+c*X,r[12]=s*x+o*z+a*V+c*Q,r[1]=l*w+u*M+d*N+h*G,r[5]=l*E+u*H+d*C+h*ie,r[9]=l*R+u*U+d*F+h*X,r[13]=l*x+u*z+d*V+h*Q,r[2]=f*w+g*M+S*N+p*G,r[6]=f*E+g*H+S*C+p*ie,r[10]=f*R+g*U+S*F+p*X,r[14]=f*x+g*z+S*V+p*Q,r[3]=m*w+T*M+A*N+v*G,r[7]=m*E+T*H+A*C+v*ie,r[11]=m*R+T*U+A*F+v*X,r[15]=m*x+T*z+A*V+v*Q,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[12],s=e[1],o=e[5],a=e[9],c=e[13],l=e[2],u=e[6],d=e[10],h=e[14],f=e[3],g=e[7],S=e[11],p=e[15],m=a*h-c*d,T=o*h-c*u,A=o*d-a*u,v=s*h-c*l,w=s*d-a*l,E=s*u-o*l;return t*(g*m-S*T+p*A)-n*(f*m-S*v+p*w)+i*(f*T-g*v+p*E)-r*(f*A-g*w+S*E)}determinantAffine(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[1],s=e[5],o=e[9],a=e[2],c=e[6],l=e[10];return t*(s*l-o*c)-n*(r*l-o*a)+i*(r*c-s*a)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let i=this.elements;if(e.isVector3)i[12]=e.x,i[13]=e.y,i[14]=e.z;else i[12]=e,i[13]=t,i[14]=n;return this}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],s=e[4],o=e[5],a=e[6],c=e[7],l=e[8],u=e[9],d=e[10],h=e[11],f=e[12],g=e[13],S=e[14],p=e[15],m=t*o-n*s,T=t*a-i*s,A=t*c-r*s,v=n*a-i*o,w=n*c-r*o,E=i*c-r*a,R=l*g-u*f,x=l*S-d*f,M=l*p-h*f,H=u*S-d*g,U=u*p-h*g,z=d*p-h*S,N=m*z-T*U+A*H+v*M-w*x+E*R;if(N===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let C=1/N;return e[0]=(o*z-a*U+c*H)*C,e[1]=(i*U-n*z-r*H)*C,e[2]=(g*E-S*w+p*v)*C,e[3]=(d*w-u*E-h*v)*C,e[4]=(a*M-s*z-c*x)*C,e[5]=(t*z-i*M+r*x)*C,e[6]=(S*A-f*E-p*T)*C,e[7]=(l*E-d*A+h*T)*C,e[8]=(s*U-o*M+c*R)*C,e[9]=(n*M-t*U-r*R)*C,e[10]=(f*w-g*A+p*m)*C,e[11]=(u*A-l*w-h*m)*C,e[12]=(o*x-s*H-a*R)*C,e[13]=(t*H-n*x+i*R)*C,e[14]=(g*T-f*v-S*m)*C,e[15]=(l*v-u*T+d*m)*C,this}scale(e){let t=this.elements,{x:n,y:i,z:r}=e;return t[0]*=n,t[4]*=i,t[8]*=r,t[1]*=n,t[5]*=i,t[9]*=r,t[2]*=n,t[6]*=i,t[10]*=r,t[3]*=n,t[7]*=i,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){if(e.isVector3)this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1);else this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1);return this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),i=Math.sin(t),r=1-n,{x:s,y:o,z:a}=e,c=r*s,l=r*o;return this.set(c*s+n,c*o-i*a,c*a+i*o,0,c*o+i*a,l*o+n,l*a-i*s,0,c*a-i*o,l*a+i*s,r*a*a+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,i,r,s){return this.set(1,n,r,0,e,1,s,0,t,i,1,0,0,0,0,1),this}compose(e,t,n){let i=this.elements,{_x:r,_y:s,_z:o,_w:a}=t,c=r+r,l=s+s,u=o+o,d=r*c,h=r*l,f=r*u,g=s*l,S=s*u,p=o*u,m=a*c,T=a*l,A=a*u,{x:v,y:w,z:E}=n;return i[0]=(1-(g+p))*v,i[1]=(h+A)*v,i[2]=(f-T)*v,i[3]=0,i[4]=(h-A)*w,i[5]=(1-(d+p))*w,i[6]=(S+m)*w,i[7]=0,i[8]=(f+T)*E,i[9]=(S-m)*E,i[10]=(1-(d+g))*E,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){let i=this.elements;e.x=i[12],e.y=i[13],e.z=i[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),t.identity(),this;let s=ur.set(i[0],i[1],i[2]).length(),o=ur.set(i[4],i[5],i[6]).length(),a=ur.set(i[8],i[9],i[10]).length();if(r<0)s=-s;vn.copy(this);let c=1/s,l=1/o,u=1/a;return vn.elements[0]*=c,vn.elements[1]*=c,vn.elements[2]*=c,vn.elements[4]*=l,vn.elements[5]*=l,vn.elements[6]*=l,vn.elements[8]*=u,vn.elements[9]*=u,vn.elements[10]*=u,t.setFromRotationMatrix(vn),n.x=s,n.y=o,n.z=a,this}makePerspective(e,t,n,i,r,s,o=2000,a=!1){let c=this.elements,l=2*r/(t-e),u=2*r/(n-i),d=(t+e)/(t-e),h=(n+i)/(n-i),f,g;if(a)f=r/(s-r),g=s*r/(s-r);else if(o===2000)f=-(s+r)/(s-r),g=-2*s*r/(s-r);else if(o===2001)f=-s/(s-r),g=-s*r/(s-r);else throw Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=l,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=h,c[13]=0,c[2]=0,c[6]=0,c[10]=f,c[14]=g,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,i,r,s,o=2000,a=!1){let c=this.elements,l=2/(t-e),u=2/(n-i),d=-(t+e)/(t-e),h=-(n+i)/(n-i),f,g;if(a)f=1/(s-r),g=s/(s-r);else if(o===2000)f=-2/(s-r),g=-(s+r)/(s-r);else if(o===2001)f=-1/(s-r),g=-r/(s-r);else throw Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=l,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=h,c[2]=0,c[6]=0,c[10]=f,c[14]=g,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}}var ur=new O,vn=new Oe,dx=new O(0,0,0),fx=new O(1,1,1),mi=new O,so=new O,en=new O,gp=new Oe,_p=new Gt;class ii{constructor(e=0,t=0,n=0,i=ii.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i=this._order){return this._x=e,this._y=t,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let i=e.elements,r=i[0],s=i[4],o=i[8],a=i[1],c=i[5],l=i[9],u=i[2],d=i[6],h=i[10];switch(t){case"XYZ":if(this._y=Math.asin($e(o,-1,1)),Math.abs(o)<0.9999999)this._x=Math.atan2(-l,h),this._z=Math.atan2(-s,r);else this._x=Math.atan2(d,c),this._z=0;break;case"YXZ":if(this._x=Math.asin(-$e(l,-1,1)),Math.abs(l)<0.9999999)this._y=Math.atan2(o,h),this._z=Math.atan2(a,c);else this._y=Math.atan2(-u,r),this._z=0;break;case"ZXY":if(this._x=Math.asin($e(d,-1,1)),Math.abs(d)<0.9999999)this._y=Math.atan2(-u,h),this._z=Math.atan2(-s,c);else this._y=0,this._z=Math.atan2(a,r);break;case"ZYX":if(this._y=Math.asin(-$e(u,-1,1)),Math.abs(u)<0.9999999)this._x=Math.atan2(d,h),this._z=Math.atan2(a,r);else this._x=0,this._z=Math.atan2(-s,c);break;case"YZX":if(this._z=Math.asin($e(a,-1,1)),Math.abs(a)<0.9999999)this._x=Math.atan2(-l,c),this._y=Math.atan2(-u,r);else this._x=0,this._y=Math.atan2(o,h);break;case"XZY":if(this._z=Math.asin(-$e(s,-1,1)),Math.abs(s)<0.9999999)this._x=Math.atan2(d,c),this._y=Math.atan2(o,r);else this._x=Math.atan2(-l,h),this._y=0;break;default:Te("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}if(this._order=t,n===!0)this._onChangeCallback();return this}setFromQuaternion(e,t,n){return gp.makeRotationFromQuaternion(e),this.setFromRotationMatrix(gp,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return _p.setFromEuler(this),this.setFromQuaternion(_p,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){if(this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0)this._order=e[3];return this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}ii.DEFAULT_ORDER="XYZ";class ms{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}var px=0,xp=new O,hr=new Gt,Jn=new Oe,oo=new O,jr=new O,mx=new O,gx=new Gt,vp=new O(1,0,0),yp=new O(0,1,0),Sp=new O(0,0,1),bp={type:"added"},_x={type:"removed"},dr={type:"childadded",child:null},ec={type:"childremoved",child:null};class dt extends zn{constructor(){super();this.isObject3D=!0,Object.defineProperty(this,"id",{value:px++}),this.uuid=Mn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=dt.DEFAULT_UP.clone();let e=new O,t=new ii,n=new Gt,i=new O(1,1,1);function r(){n.setFromEuler(t,!1)}function s(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(s),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Oe},normalMatrix:{value:new Ue}}),this.matrix=new Oe,this.matrixWorld=new Oe,this.matrixAutoUpdate=dt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=dt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new ms,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){if(this.matrixAutoUpdate)this.updateMatrix();this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return hr.setFromAxisAngle(e,t),this.quaternion.multiply(hr),this}rotateOnWorldAxis(e,t){return hr.setFromAxisAngle(e,t),this.quaternion.premultiply(hr),this}rotateX(e){return this.rotateOnAxis(vp,e)}rotateY(e){return this.rotateOnAxis(yp,e)}rotateZ(e){return this.rotateOnAxis(Sp,e)}translateOnAxis(e,t){return xp.copy(e).applyQuaternion(this.quaternion),this.position.add(xp.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(vp,e)}translateY(e){return this.translateOnAxis(yp,e)}translateZ(e){return this.translateOnAxis(Sp,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Jn.copy(this.matrixWorld).invert())}lookAt(e,t,n){if(e.isVector3)oo.copy(e);else oo.set(e,t,n);let i=this.parent;if(this.updateWorldMatrix(!0,!1),jr.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight)Jn.lookAt(jr,oo,this.up);else Jn.lookAt(oo,jr,this.up);if(this.quaternion.setFromRotationMatrix(Jn),i)Jn.extractRotation(i.matrixWorld),hr.setFromRotationMatrix(Jn),this.quaternion.premultiply(hr.invert())}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}if(e===this)return De("Object3D.add: object can't be added as a child of itself.",e),this;if(e&&e.isObject3D)e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(bp),dr.child=e,this.dispatchEvent(dr),dr.child=null;else De("Object3D.add: object not an instance of THREE.Object3D.",e);return this}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);if(t!==-1)e.parent=null,this.children.splice(t,1),e.dispatchEvent(_x),ec.child=e,this.dispatchEvent(ec),ec.child=null;return this}removeFromParent(){let e=this.parent;if(e!==null)e.remove(this);return this}clear(){return this.remove(...this.children)}attach(e){if(this.updateWorldMatrix(!0,!1),Jn.copy(this.matrixWorld).invert(),e.parent!==null)e.parent.updateWorldMatrix(!0,!1),Jn.multiply(e.parent.matrixWorld);return e.applyMatrix4(Jn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(bp),dr.child=e,this.dispatchEvent(dr),dr.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){let s=this.children[n].getObjectByProperty(e,t);if(s!==void 0)return s}return}getObjectsByProperty(e,t,n=[]){if(this[e]===t)n.push(this);let i=this.children;for(let r=0,s=i.length;r<s;r++)i[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(jr,e,mx),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(jr,gx,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(e){e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;if(t!==null)e(t),t.traverseAncestors(e)}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let{x:t,y:n,z:i}=e,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*n-r[8]*i,r[13]+=n-r[1]*t-r[5]*n-r[9]*i,r[14]+=i-r[2]*t-r[6]*n-r[10]*i}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){if(this.matrixAutoUpdate)this.updateMatrix();if(this.matrixWorldNeedsUpdate||e){if(this.matrixWorldAutoUpdate===!0)if(this.parent===null)this.matrixWorld.copy(this.matrix);else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix);this.matrixWorldNeedsUpdate=!1,e=!0}let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){let i=this.parent;if(e===!0&&i!==null)i.updateWorldMatrix(!0,!1);if(this.matrixAutoUpdate)this.updateMatrix();if(this.matrixWorldNeedsUpdate||n){if(this.matrixWorldAutoUpdate===!0)if(this.parent===null)this.matrixWorld.copy(this.matrix);else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix);this.matrixWorldNeedsUpdate=!1,n=!0}if(t===!0){let r=this.children;for(let s=0,o=r.length;s<o;s++)r[s].updateWorldMatrix(!1,!0,n)}}toJSON(e){let t=e===void 0||typeof e==="string",n={};if(t)e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"};let i={};if(i.uuid=this.uuid,i.type=this.type,i.name=this.name,i.castShadow=this.castShadow,i.receiveShadow=this.receiveShadow,i.visible=this.visible,i.frustumCulled=this.frustumCulled,i.renderOrder=this.renderOrder,i.static=this.static,i.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0)i.userData=this.userData;if(i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.pivot!==null)i.pivot=this.pivot.toArray();if(this.morphTargetDictionary!==void 0)i.morphTargetDictionary=Object.assign({},this.morphTargetDictionary);if(this.morphTargetInfluences!==void 0)i.morphTargetInfluences=this.morphTargetInfluences.slice();if(this.isInstancedMesh){if(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null)i.instanceColor=this.instanceColor.toJSON()}if(this.isBatchedMesh){if(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map((o)=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map((o)=>({...o})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(e),i.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null)i.colorsTexture=this._colorsTexture.toJSON(e);if(this.boundingSphere!==null)i.boundingSphere=this.boundingSphere.toJSON();if(this.boundingBox!==null)i.boundingBox=this.boundingBox.toJSON()}function r(o,a){if(o[a.uuid]===void 0)o[a.uuid]=a.toJSON(e);return a.uuid}if(this.isScene){if(this.background){if(this.background.isColor)i.background=this.background.toJSON();else if(this.background.isTexture)i.background=this.background.toJSON(e).uuid}if(this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0)i.environment=this.environment.toJSON(e).uuid}else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(e.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let a=o.shapes;if(Array.isArray(a))for(let c=0,l=a.length;c<l;c++){let u=a[c];r(e.shapes,u)}else r(e.shapes,a)}}if(this.isSkinnedMesh){if(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0)r(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid}if(this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let a=0,c=this.material.length;a<c;a++)o.push(r(e.materials,this.material[a]));i.material=o}else i.material=r(e.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){let a=this.animations[o];i.animations.push(r(e.animations,a))}}if(t){let o=s(e.geometries),a=s(e.materials),c=s(e.textures),l=s(e.images),u=s(e.shapes),d=s(e.skeletons),h=s(e.animations),f=s(e.nodes);if(o.length>0)n.geometries=o;if(a.length>0)n.materials=a;if(c.length>0)n.textures=c;if(l.length>0)n.images=l;if(u.length>0)n.shapes=u;if(d.length>0)n.skeletons=d;if(h.length>0)n.animations=h;if(f.length>0)n.nodes=f}return n.object=i,n;function s(o){let a=[];for(let c in o){let l=o[c];delete l.metadata,a.push(l)}return a}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let i=e.children[n];this.add(i.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}}dt.DEFAULT_UP=new O(0,1,0);dt.DEFAULT_MATRIX_AUTO_UPDATE=!0;dt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class Kt extends dt{constructor(){super();this.isGroup=!0,this.type="Group"}}var xx={type:"move"};class gs{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){if(this._hand===null)this._hand=new Kt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1};return this._hand}getTargetRaySpace(){if(this._targetRay===null)this._targetRay=new Kt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new O,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new O;return this._targetRay}getGripSpace(){if(this._grip===null)this._grip=new Kt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new O,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new O,this._grip.eventsEnabled=!1;return this._grip}dispatchEvent(e){if(this._targetRay!==null)this._targetRay.dispatchEvent(e);if(this._grip!==null)this._grip.dispatchEvent(e);if(this._hand!==null)this._hand.dispatchEvent(e);return this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){if(this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null)this._targetRay.visible=!1;if(this._grip!==null)this._grip.visible=!1;if(this._hand!==null)this._hand.visible=!1;return this}update(e,t,n){let i=null,r=null,s=null,o=this._targetRay,a=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){s=!0;for(let g of e.hand.values()){let S=t.getJointPose(g,n),p=this._getHandJoint(c,g);if(S!==null)p.matrix.fromArray(S.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=S.radius;p.visible=S!==null}let l=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],d=l.position.distanceTo(u.position),h=0.02,f=0.005;if(c.inputState.pinching&&d>h+f)c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this});else if(!c.inputState.pinching&&d<=h-f)c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this})}else if(a!==null&&e.gripSpace){if(r=t.getPose(e.gripSpace,n),r!==null){if(a.matrix.fromArray(r.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,r.linearVelocity)a.hasLinearVelocity=!0,a.linearVelocity.copy(r.linearVelocity);else a.hasLinearVelocity=!1;if(r.angularVelocity)a.hasAngularVelocity=!0,a.angularVelocity.copy(r.angularVelocity);else a.hasAngularVelocity=!1;if(a.eventsEnabled)a.dispatchEvent({type:"gripUpdated",data:e,target:this})}}if(o!==null){if(i=t.getPose(e.targetRaySpace,n),i===null&&r!==null)i=r;if(i!==null){if(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity)o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity);else o.hasLinearVelocity=!1;if(i.angularVelocity)o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity);else o.hasAngularVelocity=!1;this.dispatchEvent(xx)}}}if(o!==null)o.visible=i!==null;if(a!==null)a.visible=r!==null;if(c!==null)c.visible=s!==null;return this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new Kt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}var qm={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},gi={h:0,s:0,l:0},ao={h:0,s:0,l:0};function tc(e,t,n){if(n<0)n+=1;if(n>1)n-=1;if(n<0.16666666666666666)return e+(t-e)*6*n;if(n<0.5)return t;if(n<0.6666666666666666)return e+(t-e)*6*(0.6666666666666666-n);return e}class Ie{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let i=e;if(i&&i.isColor)this.copy(i);else if(typeof i==="number")this.setHex(i);else if(typeof i==="string")this.setStyle(i)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t="srgb"){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,He.colorSpaceToWorking(this,t),this}setRGB(e,t,n,i=He.workingColorSpace){return this.r=e,this.g=t,this.b=n,He.colorSpaceToWorking(this,i),this}setHSL(e,t,n,i=He.workingColorSpace){if(e=Ml(e,1),t=$e(t,0,1),n=$e(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=0.5?n*(1+t):n+t-n*t,s=2*n-r;this.r=tc(s,r,e+0.3333333333333333),this.g=tc(s,r,e),this.b=tc(s,r,e-0.3333333333333333)}return He.colorSpaceToWorking(this,i),this}setStyle(e,t="srgb"){function n(r){if(r===void 0)return;if(parseFloat(r)<1)Te("Color: Alpha component of "+e+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(e)){let r,s=i[1],o=i[2];switch(s){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:Te("Color: Unknown color model "+e)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(e)){let r=i[1],s=r.length;if(s===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);else if(s===6)return this.setHex(parseInt(r,16),t);else Te("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t="srgb"){let n=qm[e.toLowerCase()];if(n!==void 0)this.setHex(n,t);else Te("Color: Unknown color "+e);return this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=ni(e.r),this.g=ni(e.g),this.b=ni(e.b),this}copyLinearToSRGB(e){return this.r=Mr(e.r),this.g=Mr(e.g),this.b=Mr(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e="srgb"){return He.workingToColorSpace(Wt.copy(this),e),Math.round($e(Wt.r*255,0,255))*65536+Math.round($e(Wt.g*255,0,255))*256+Math.round($e(Wt.b*255,0,255))}getHexString(e="srgb"){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=He.workingColorSpace){He.workingToColorSpace(Wt.copy(this),t);let{r:n,g:i,b:r}=Wt,s=Math.max(n,i,r),o=Math.min(n,i,r),a,c,l=(o+s)/2;if(o===s)a=0,c=0;else{let u=s-o;switch(c=l<=0.5?u/(s+o):u/(2-s-o),s){case n:a=(i-r)/u+(i<r?6:0);break;case i:a=(r-n)/u+2;break;case r:a=(n-i)/u+4;break}a/=6}return e.h=a,e.s=c,e.l=l,e}getRGB(e,t=He.workingColorSpace){return He.workingToColorSpace(Wt.copy(this),t),e.r=Wt.r,e.g=Wt.g,e.b=Wt.b,e}getStyle(e="srgb"){He.workingToColorSpace(Wt.copy(this),e);let{r:t,g:n,b:i}=Wt;if(e!=="srgb")return`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`;return`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(e,t,n){return this.getHSL(gi),this.setHSL(gi.h+e,gi.s+t,gi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(gi),e.getHSL(ao);let n=as(gi.h,ao.h,t),i=as(gi.s,ao.s,t),r=as(gi.l,ao.l,t);return this.setHSL(n,i,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,i=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*i,this.g=r[1]*t+r[4]*n+r[7]*i,this.b=r[2]*t+r[5]*n+r[8]*i,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}var Wt=new Ie;Ie.NAMES=qm;class qo extends dt{constructor(){super();if(this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new ii,this.environmentIntensity=1,this.environmentRotation=new ii,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){if(super.copy(e,t),e.background!==null)this.background=e.background.clone();if(e.environment!==null)this.environment=e.environment.clone();if(e.fog!==null)this.fog=e.fog.clone();if(this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null)this.overrideMaterial=e.overrideMaterial.clone();return this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);if(this.fog!==null)t.object.fog=this.fog.toJSON();return t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}}var yn=new O,Kn=new O,nc=new O,jn=new O,fr=new O,pr=new O,Mp=new O,ic=new O,rc=new O,sc=new O,oc=new ot,ac=new ot,cc=new ot;class fn{constructor(e=new O,t=new O,n=new O){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i.subVectors(n,t),yn.subVectors(e,t),i.cross(yn);let r=i.lengthSq();if(r>0)return i.multiplyScalar(1/Math.sqrt(r));return i.set(0,0,0)}static getBarycoord(e,t,n,i,r){yn.subVectors(i,t),Kn.subVectors(n,t),nc.subVectors(e,t);let s=yn.dot(yn),o=yn.dot(Kn),a=yn.dot(nc),c=Kn.dot(Kn),l=Kn.dot(nc),u=s*c-o*o;if(u===0)return r.set(0,0,0),null;let d=1/u,h=(c*a-o*l)*d,f=(s*l-o*a)*d;return r.set(1-h-f,f,h)}static containsPoint(e,t,n,i){if(this.getBarycoord(e,t,n,i,jn)===null)return!1;return jn.x>=0&&jn.y>=0&&jn.x+jn.y<=1}static getInterpolation(e,t,n,i,r,s,o,a){if(this.getBarycoord(e,t,n,i,jn)===null){if(a.x=0,a.y=0,"z"in a)a.z=0;if("w"in a)a.w=0;return null}return a.setScalar(0),a.addScaledVector(r,jn.x),a.addScaledVector(s,jn.y),a.addScaledVector(o,jn.z),a}static getInterpolatedAttribute(e,t,n,i,r,s){return oc.setScalar(0),ac.setScalar(0),cc.setScalar(0),oc.fromBufferAttribute(e,t),ac.fromBufferAttribute(e,n),cc.fromBufferAttribute(e,i),s.setScalar(0),s.addScaledVector(oc,r.x),s.addScaledVector(ac,r.y),s.addScaledVector(cc,r.z),s}static isFrontFacing(e,t,n,i){return yn.subVectors(n,t),Kn.subVectors(e,t),yn.cross(Kn).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}setFromAttributeAndIndices(e,t,n,i){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return yn.subVectors(this.c,this.b),Kn.subVectors(this.a,this.b),yn.cross(Kn).length()*0.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(0.3333333333333333)}getNormal(e){return fn.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return fn.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,i,r){return fn.getInterpolation(e,this.a,this.b,this.c,t,n,i,r)}containsPoint(e){return fn.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return fn.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,i=this.b,r=this.c,s,o;fr.subVectors(i,n),pr.subVectors(r,n),ic.subVectors(e,n);let a=fr.dot(ic),c=pr.dot(ic);if(a<=0&&c<=0)return t.copy(n);rc.subVectors(e,i);let l=fr.dot(rc),u=pr.dot(rc);if(l>=0&&u<=l)return t.copy(i);let d=a*u-l*c;if(d<=0&&a>=0&&l<=0)return s=a/(a-l),t.copy(n).addScaledVector(fr,s);sc.subVectors(e,r);let h=fr.dot(sc),f=pr.dot(sc);if(f>=0&&h<=f)return t.copy(r);let g=h*c-a*f;if(g<=0&&c>=0&&f<=0)return o=c/(c-f),t.copy(n).addScaledVector(pr,o);let S=l*f-h*u;if(S<=0&&u-l>=0&&h-f>=0)return Mp.subVectors(r,i),o=(u-l)/(u-l+(h-f)),t.copy(i).addScaledVector(Mp,o);let p=1/(S+g+d);return s=g*p,o=d*p,t.copy(n).addScaledVector(fr,s).addScaledVector(pr,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class gn{constructor(e=new O(1/0,1/0,1/0),t=new O(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Sn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Sn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=Sn.copy(t).multiplyScalar(0.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(0.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let s=0,o=r.count;s<o;s++){if(e.isMesh===!0)e.getVertexPosition(s,Sn);else Sn.fromBufferAttribute(r,s);Sn.applyMatrix4(e.matrixWorld),this.expandByPoint(Sn)}else{if(e.boundingBox!==void 0){if(e.boundingBox===null)e.computeBoundingBox();co.copy(e.boundingBox)}else{if(n.boundingBox===null)n.computeBoundingBox();co.copy(n.boundingBox)}co.applyMatrix4(e.matrixWorld),this.union(co)}}let i=e.children;for(let r=0,s=i.length;r<s;r++)this.expandByObject(i[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Sn),Sn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;if(e.normal.x>0)t=e.normal.x*this.min.x,n=e.normal.x*this.max.x;else t=e.normal.x*this.max.x,n=e.normal.x*this.min.x;if(e.normal.y>0)t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y;else t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y;if(e.normal.z>0)t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z;else t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z;return t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Qr),lo.subVectors(this.max,Qr),mr.subVectors(e.a,Qr),gr.subVectors(e.b,Qr),_r.subVectors(e.c,Qr),_i.subVectors(gr,mr),xi.subVectors(_r,gr),zi.subVectors(mr,_r);let t=[0,-_i.z,_i.y,0,-xi.z,xi.y,0,-zi.z,zi.y,_i.z,0,-_i.x,xi.z,0,-xi.x,zi.z,0,-zi.x,-_i.y,_i.x,0,-xi.y,xi.x,0,-zi.y,zi.x,0];if(!lc(t,mr,gr,_r,lo))return!1;if(t=[1,0,0,0,1,0,0,0,1],!lc(t,mr,gr,_r,lo))return!1;return uo.crossVectors(_i,xi),t=[uo.x,uo.y,uo.z],lc(t,mr,gr,_r,lo)}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Sn).distanceTo(e)}getBoundingSphere(e){if(this.isEmpty())e.makeEmpty();else this.getCenter(e.center),e.radius=this.getSize(Sn).length()*0.5;return e}intersect(e){if(this.min.max(e.min),this.max.min(e.max),this.isEmpty())this.makeEmpty();return this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){if(this.isEmpty())return this;return Qn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Qn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Qn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Qn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Qn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Qn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Qn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Qn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Qn),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}var Qn=[new O,new O,new O,new O,new O,new O,new O,new O],Sn=new O,co=new gn,mr=new O,gr=new O,_r=new O,_i=new O,xi=new O,zi=new O,Qr=new O,lo=new O,uo=new O,ki=new O;function lc(e,t,n,i,r){for(let s=0,o=e.length-3;s<=o;s+=3){ki.fromArray(e,s);let a=r.x*Math.abs(ki.x)+r.y*Math.abs(ki.y)+r.z*Math.abs(ki.z),c=t.dot(ki),l=n.dot(ki),u=i.dot(ki);if(Math.max(-Math.max(c,l,u),Math.min(c,l,u))>a)return!1}return!0}var Rt=new O,ho=new ze,vx=0;class Ft extends zn{constructor(e,t,n=!1){super();if(Array.isArray(e))throw TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:vx++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=35044,this.updateRanges=[],this.gpuType=1015,this.version=0}onUploadCallback(){}set needsUpdate(e){if(e===!0)this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)ho.fromBufferAttribute(this,t),ho.applyMatrix3(e),this.setXY(t,ho.x,ho.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Rt.fromBufferAttribute(this,t),Rt.applyMatrix3(e),this.setXYZ(t,Rt.x,Rt.y,Rt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Rt.fromBufferAttribute(this,t),Rt.applyMatrix4(e),this.setXYZ(t,Rt.x,Rt.y,Rt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Rt.fromBufferAttribute(this,t),Rt.applyNormalMatrix(e),this.setXYZ(t,Rt.x,Rt.y,Rt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Rt.fromBufferAttribute(this,t),Rt.transformDirection(e),this.setXYZ(t,Rt.x,Rt.y,Rt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];if(this.normalized)n=bn(n,this.array);return n}setComponent(e,t,n){if(this.normalized)n=st(n,this.array);return this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];if(this.normalized)t=bn(t,this.array);return t}setX(e,t){if(this.normalized)t=st(t,this.array);return this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];if(this.normalized)t=bn(t,this.array);return t}setY(e,t){if(this.normalized)t=st(t,this.array);return this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];if(this.normalized)t=bn(t,this.array);return t}setZ(e,t){if(this.normalized)t=st(t,this.array);return this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];if(this.normalized)t=bn(t,this.array);return t}setW(e,t){if(this.normalized)t=st(t,this.array);return this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){if(e*=this.itemSize,this.normalized)t=st(t,this.array),n=st(n,this.array);return this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){if(e*=this.itemSize,this.normalized)t=st(t,this.array),n=st(n,this.array),i=st(i,this.array);return this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,r){if(e*=this.itemSize,this.normalized)t=st(t,this.array),n=st(n,this.array),i=st(i,this.array),r=st(r,this.array);return this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:"dispose"})}}class Yo extends Ft{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class Jo extends Ft{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class bt extends Ft{constructor(e,t,n){super(new Float32Array(e),t,n)}}var yx=new gn,es=new O,uc=new O;class sn{constructor(e=new O,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;if(t!==void 0)n.copy(t);else yx.setFromPoints(e).getCenter(n);let i=0;for(let r=0,s=e.length;r<s;r++)i=Math.max(i,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);if(t.copy(e),n>this.radius*this.radius)t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center);return t}getBoundingBox(e){if(this.isEmpty())return e.makeEmpty(),e;return e.set(this.center,this.center),e.expandByScalar(this.radius),e}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;es.subVectors(e,this.center);let t=es.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),i=(n-this.radius)*0.5;this.center.addScaledVector(es,i/n),this.radius+=i}return this}union(e){if(e.isEmpty())return this;if(this.isEmpty())return this.copy(e),this;if(this.center.equals(e.center)===!0)this.radius=Math.max(this.radius,e.radius);else uc.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(es.copy(e.center).add(uc)),this.expandByPoint(es.copy(e.center).sub(uc));return this}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}var Sx=0,hn=new Oe,hc=new dt,xr=new O,tn=new gn,ts=new gn,Ot=new O;class Tt extends zn{constructor(){super();this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Sx++}),this.uuid=Mn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){if(Array.isArray(e))this.index=new(($0(e))?Jo:Yo)(e,1);else this.index=e;return this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;if(t!==void 0)t.applyMatrix4(e),t.needsUpdate=!0;let n=this.attributes.normal;if(n!==void 0){let r=new Ue().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;if(i!==void 0)i.transformDirection(e),i.needsUpdate=!0;if(this.boundingBox!==null)this.computeBoundingBox();if(this.boundingSphere!==null)this.computeBoundingSphere();return this._transformed=!0,this}applyQuaternion(e){return hn.makeRotationFromQuaternion(e),this.applyMatrix4(hn),this}rotateX(e){return hn.makeRotationX(e),this.applyMatrix4(hn),this}rotateY(e){return hn.makeRotationY(e),this.applyMatrix4(hn),this}rotateZ(e){return hn.makeRotationZ(e),this.applyMatrix4(hn),this}translate(e,t,n){return hn.makeTranslation(e,t,n),this.applyMatrix4(hn),this}scale(e,t,n){return hn.makeScale(e,t,n),this.applyMatrix4(hn),this}lookAt(e){return hc.lookAt(e),hc.updateMatrix(),this.applyMatrix4(hc.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(xr).negate(),this.translate(xr.x,xr.y,xr.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let n=[];for(let i=0,r=e.length;i<r;i++){let s=e[i];n.push(s.x,s.y,s.z||0)}this.setAttribute("position",new bt(n,3))}else{let n=Math.min(e.length,t.count);for(let i=0;i<n;i++){let r=e[i];t.setXYZ(i,r.x,r.y,r.z||0)}if(e.length>t.count)Te("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.");t.needsUpdate=!0}return this}computeBoundingBox(){if(this.boundingBox===null)this.boundingBox=new gn;let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){De("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new O(-1/0,-1/0,-1/0),new O(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){let r=t[n];if(tn.setFromBufferAttribute(r),this.morphTargetsRelative)Ot.addVectors(this.boundingBox.min,tn.min),this.boundingBox.expandByPoint(Ot),Ot.addVectors(this.boundingBox.max,tn.max),this.boundingBox.expandByPoint(Ot);else this.boundingBox.expandByPoint(tn.min),this.boundingBox.expandByPoint(tn.max)}}else this.boundingBox.makeEmpty();if(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))De('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){if(this.boundingSphere===null)this.boundingSphere=new sn;let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){De("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new O,1/0);return}if(e){let n=this.boundingSphere.center;if(tn.setFromBufferAttribute(e),t)for(let r=0,s=t.length;r<s;r++){let o=t[r];if(ts.setFromBufferAttribute(o),this.morphTargetsRelative)Ot.addVectors(tn.min,ts.min),tn.expandByPoint(Ot),Ot.addVectors(tn.max,ts.max),tn.expandByPoint(Ot);else tn.expandByPoint(ts.min),tn.expandByPoint(ts.max)}tn.getCenter(n);let i=0;for(let r=0,s=e.count;r<s;r++)Ot.fromBufferAttribute(e,r),i=Math.max(i,n.distanceToSquared(Ot));if(t)for(let r=0,s=t.length;r<s;r++){let o=t[r],a=this.morphTargetsRelative;for(let c=0,l=o.count;c<l;c++){if(Ot.fromBufferAttribute(o,c),a)xr.fromBufferAttribute(e,c),Ot.add(xr);i=Math.max(i,n.distanceToSquared(Ot))}}if(this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius))De('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){De("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let{position:n,normal:i,uv:r}=t,s=this.getAttribute("tangent");if(s===void 0||s.count!==n.count)s=new Ft(new Float32Array(4*n.count),4),this.setAttribute("tangent",s);let o=[],a=[];for(let R=0;R<n.count;R++)o[R]=new O,a[R]=new O;let c=new O,l=new O,u=new O,d=new ze,h=new ze,f=new ze,g=new O,S=new O;function p(R,x,M){c.fromBufferAttribute(n,R),l.fromBufferAttribute(n,x),u.fromBufferAttribute(n,M),d.fromBufferAttribute(r,R),h.fromBufferAttribute(r,x),f.fromBufferAttribute(r,M),l.sub(c),u.sub(c),h.sub(d),f.sub(d);let H=1/(h.x*f.y-f.x*h.y);if(!isFinite(H))return;g.copy(l).multiplyScalar(f.y).addScaledVector(u,-h.y).multiplyScalar(H),S.copy(u).multiplyScalar(h.x).addScaledVector(l,-f.x).multiplyScalar(H),o[R].add(g),o[x].add(g),o[M].add(g),a[R].add(S),a[x].add(S),a[M].add(S)}let m=this.groups;if(m.length===0)m=[{start:0,count:e.count}];for(let R=0,x=m.length;R<x;++R){let M=m[R],{start:H,count:U}=M;for(let z=H,N=H+U;z<N;z+=3)p(e.getX(z+0),e.getX(z+1),e.getX(z+2))}let T=new O,A=new O,v=new O,w=new O;function E(R){v.fromBufferAttribute(i,R),w.copy(v);let x=o[R];T.copy(x),T.sub(v.multiplyScalar(v.dot(x))).normalize(),A.crossVectors(w,x);let H=A.dot(a[R])<0?-1:1;s.setXYZW(R,T.x,T.y,T.z,H)}for(let R=0,x=m.length;R<x;++R){let M=m[R],{start:H,count:U}=M;for(let z=H,N=H+U;z<N;z+=3)E(e.getX(z+0)),E(e.getX(z+1)),E(e.getX(z+2))}this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==t.count)n=new Ft(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,h=n.count;d<h;d++)n.setXYZ(d,0,0,0);let i=new O,r=new O,s=new O,o=new O,a=new O,c=new O,l=new O,u=new O;if(e)for(let d=0,h=e.count;d<h;d+=3){let f=e.getX(d+0),g=e.getX(d+1),S=e.getX(d+2);i.fromBufferAttribute(t,f),r.fromBufferAttribute(t,g),s.fromBufferAttribute(t,S),l.subVectors(s,r),u.subVectors(i,r),l.cross(u),o.fromBufferAttribute(n,f),a.fromBufferAttribute(n,g),c.fromBufferAttribute(n,S),o.add(l),a.add(l),c.add(l),n.setXYZ(f,o.x,o.y,o.z),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(S,c.x,c.y,c.z)}else for(let d=0,h=t.count;d<h;d+=3)i.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),s.fromBufferAttribute(t,d+2),l.subVectors(s,r),u.subVectors(i,r),l.cross(u),n.setXYZ(d+0,l.x,l.y,l.z),n.setXYZ(d+1,l.x,l.y,l.z),n.setXYZ(d+2,l.x,l.y,l.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Ot.fromBufferAttribute(e,t),Ot.normalize(),e.setXYZ(t,Ot.x,Ot.y,Ot.z)}toNonIndexed(){function e(o,a){let{array:c,itemSize:l,normalized:u}=o,d=new c.constructor(a.length*l),h=0,f=0;for(let g=0,S=a.length;g<S;g++){if(o.isInterleavedBufferAttribute)h=a[g]*o.data.stride+o.offset;else h=a[g]*l;for(let p=0;p<l;p++)d[f++]=c[h++]}return new Ft(d,l,u)}if(this.index===null)return Te("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new Tt,n=this.index.array,i=this.attributes;for(let o in i){let a=i[o],c=e(a,n);t.setAttribute(o,c)}let r=this.morphAttributes;for(let o in r){let a=[],c=r[o];for(let l=0,u=c.length;l<u;l++){let d=c[l],h=e(d,n);a.push(h)}t.morphAttributes[o]=a}t.morphTargetsRelative=this.morphTargetsRelative;let s=this.groups;for(let o=0,a=s.length;o<a;o++){let c=s[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){let e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,e.name=this.name,Object.keys(this.userData).length>0)e.userData=this.userData;if(this.parameters!==void 0&&this._transformed!==!0){let a=this.parameters;for(let c in a)if(a[c]!==void 0)e[c]=a[c];return e}e.data={attributes:{}};let t=this.index;if(t!==null)e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)};let n=this.attributes;for(let a in n){let c=n[a];e.data.attributes[a]=c.toJSON(e.data)}let i={},r=!1;for(let a in this.morphAttributes){let c=this.morphAttributes[a],l=[];for(let u=0,d=c.length;u<d;u++){let h=c[u];l.push(h.toJSON(e.data))}if(l.length>0)i[a]=l,r=!0}if(r)e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative;let s=this.groups;if(s.length>0)e.data.groups=JSON.parse(JSON.stringify(s));let o=this.boundingSphere;if(o!==null)e.data.boundingSphere=o.toJSON();return e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;if(n!==null)this.setIndex(n.clone());let i=e.attributes;for(let c in i){let l=i[c];this.setAttribute(c,l.clone(t))}let r=e.morphAttributes;for(let c in r){let l=[],u=r[c];for(let d=0,h=u.length;d<h;d++)l.push(u[d].clone(t));this.morphAttributes[c]=l}this.morphTargetsRelative=e.morphTargetsRelative;let s=e.groups;for(let c=0,l=s.length;c<l;c++){let u=s[c];this.addGroup(u.start,u.count,u.materialIndex)}let o=e.boundingBox;if(o!==null)this.boundingBox=o.clone();let a=e.boundingSphere;if(a!==null)this.boundingSphere=a.clone();return this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}class _s{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=35044,this.updateRanges=[],this.version=0,this.uuid=Mn()}onUploadCallback(){}set needsUpdate(e){if(e===!0)this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let i=0,r=this.stride;i<r;i++)this.array[e+i]=t.array[n+i];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){if(e.arrayBuffers===void 0)e.arrayBuffers={};if(this.array.buffer._uuid===void 0)this.array.buffer._uuid=Mn();if(e.arrayBuffers[this.array.buffer._uuid]===void 0)e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer;let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){if(e.arrayBuffers===void 0)e.arrayBuffers={};if(this.array.buffer._uuid===void 0)this.array.buffer._uuid=Mn();if(e.arrayBuffers[this.array.buffer._uuid]===void 0)e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer));let t={uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride};return t.usage=this.usage,t}}var qt=new O;class Dr{constructor(e,t,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)qt.fromBufferAttribute(this,t),qt.applyMatrix4(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)qt.fromBufferAttribute(this,t),qt.applyNormalMatrix(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)qt.fromBufferAttribute(this,t),qt.transformDirection(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];if(this.normalized)n=bn(n,this.array);return n}setComponent(e,t,n){if(this.normalized)n=st(n,this.array);return this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){if(this.normalized)t=st(t,this.array);return this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){if(this.normalized)t=st(t,this.array);return this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){if(this.normalized)t=st(t,this.array);return this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){if(this.normalized)t=st(t,this.array);return this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];if(this.normalized)t=bn(t,this.array);return t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];if(this.normalized)t=bn(t,this.array);return t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];if(this.normalized)t=bn(t,this.array);return t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];if(this.normalized)t=bn(t,this.array);return t}setXY(e,t,n){if(e=e*this.data.stride+this.offset,this.normalized)t=st(t,this.array),n=st(n,this.array);return this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,i){if(e=e*this.data.stride+this.offset,this.normalized)t=st(t,this.array),n=st(n,this.array),i=st(i,this.array);return this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this}setXYZW(e,t,n,i,r){if(e=e*this.data.stride+this.offset,this.normalized)t=st(t,this.array),n=st(n,this.array),i=st(i,this.array),r=st(r,this.array);return this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this.data.array[e+3]=r,this}clone(e){if(e===void 0){cs("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return new Ft(new this.array.constructor(t),this.itemSize,this.normalized)}else{if(e.interleavedBuffers===void 0)e.interleavedBuffers={};if(e.interleavedBuffers[this.data.uuid]===void 0)e.interleavedBuffers[this.data.uuid]=this.data.clone(e);return new Dr(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}}toJSON(e){if(e===void 0){cs("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else{if(e.interleavedBuffers===void 0)e.interleavedBuffers={};if(e.interleavedBuffers[this.data.uuid]===void 0)e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e);return{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}}var dc=new O,bx=new O,Mx=new Ue;class dn{constructor(e=new O(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let i=dc.subVectors(n,t).cross(bx.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){let i=e.delta(dc),r=this.normal.dot(i);if(r===0){if(this.distanceToPoint(e.start)===0)return t.copy(e.start);return null}let s=-(e.start.dot(this.normal)+this.constant)/r;if(n===!0&&(s<0||s>1))return null;return t.copy(e.start).addScaledVector(i,s)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||Mx.getNormalMatrix(e),i=this.coplanarPoint(dc).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}}var wx=0;class on extends zn{constructor(){super();this.isMaterial=!0,Object.defineProperty(this,"id",{value:wx++}),this.uuid=Mn(),this.name="",this.type="Material",this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ie(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=7680,this.stencilZFail=7680,this.stencilZPass=7680,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){if(this._alphaTest>0!==e>0)this.version++;this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e===void 0)return;for(let t in e){let n=e[t];if(n===void 0){Te(`Material: parameter '${t}' has value of undefined.`);continue}let i=this[t];if(i===void 0){Te(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}if(i&&i.isColor)i.set(n);else if(i&&i.isVector2&&(n&&n.isVector2)||i&&i.isEuler&&(n&&n.isEuler)||i&&i.isVector3&&(n&&n.isVector3))i.copy(n);else this[t]=n}}toJSON(e){let t=e===void 0||typeof e==="string";if(t)e={textures:{},images:{}};let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};if(n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor)n.color=this.color.getHex();if(this.roughness!==void 0)n.roughness=this.roughness;if(this.metalness!==void 0)n.metalness=this.metalness;if(this.sheen!==void 0)n.sheen=this.sheen;if(this.sheenColor&&this.sheenColor.isColor)n.sheenColor=this.sheenColor.getHex();if(this.sheenRoughness!==void 0)n.sheenRoughness=this.sheenRoughness;if(this.emissive&&this.emissive.isColor)n.emissive=this.emissive.getHex();if(this.emissiveIntensity!==void 0)n.emissiveIntensity=this.emissiveIntensity;if(this.specular&&this.specular.isColor)n.specular=this.specular.getHex();if(this.specularIntensity!==void 0)n.specularIntensity=this.specularIntensity;if(this.specularColor&&this.specularColor.isColor)n.specularColor=this.specularColor.getHex();if(this.shininess!==void 0)n.shininess=this.shininess;if(this.clearcoat!==void 0)n.clearcoat=this.clearcoat;if(this.clearcoatRoughness!==void 0)n.clearcoatRoughness=this.clearcoatRoughness;if(this.clearcoatMap&&this.clearcoatMap.isTexture)n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid;if(this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture)n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid;if(this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture)n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray();if(this.sheenColorMap&&this.sheenColorMap.isTexture)n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid;if(this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture)n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid;if(this.dispersion!==void 0)n.dispersion=this.dispersion;if(this.retroreflectivity!==void 0)n.retroreflectivity=this.retroreflectivity;if(this.iridescence!==void 0)n.iridescence=this.iridescence;if(this.iridescenceIOR!==void 0)n.iridescenceIOR=this.iridescenceIOR;if(this.iridescenceThicknessRange!==void 0)n.iridescenceThicknessRange=this.iridescenceThicknessRange;if(this.iridescenceMap&&this.iridescenceMap.isTexture)n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid;if(this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture)n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid;if(this.anisotropy!==void 0)n.anisotropy=this.anisotropy;if(this.anisotropyRotation!==void 0)n.anisotropyRotation=this.anisotropyRotation;if(this.anisotropyMap&&this.anisotropyMap.isTexture)n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid;if(this.map&&this.map.isTexture)n.map=this.map.toJSON(e).uuid;if(this.matcap&&this.matcap.isTexture)n.matcap=this.matcap.toJSON(e).uuid;if(this.alphaMap&&this.alphaMap.isTexture)n.alphaMap=this.alphaMap.toJSON(e).uuid;if(this.lightMap&&this.lightMap.isTexture)n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity;if(this.aoMap&&this.aoMap.isTexture)n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity;if(this.bumpMap&&this.bumpMap.isTexture)n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale;if(this.normalMap&&this.normalMap.isTexture)n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray();if(this.displacementMap&&this.displacementMap.isTexture)n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias;if(this.roughnessMap&&this.roughnessMap.isTexture)n.roughnessMap=this.roughnessMap.toJSON(e).uuid;if(this.metalnessMap&&this.metalnessMap.isTexture)n.metalnessMap=this.metalnessMap.toJSON(e).uuid;if(this.emissiveMap&&this.emissiveMap.isTexture)n.emissiveMap=this.emissiveMap.toJSON(e).uuid;if(this.specularMap&&this.specularMap.isTexture)n.specularMap=this.specularMap.toJSON(e).uuid;if(this.specularIntensityMap&&this.specularIntensityMap.isTexture)n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid;if(this.specularColorMap&&this.specularColorMap.isTexture)n.specularColorMap=this.specularColorMap.toJSON(e).uuid;if(this.envMap&&this.envMap.isTexture){if(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0)n.combine=this.combine}if(this.envMapRotation!==void 0)n.envMapRotation=this.envMapRotation.toArray();if(this.envMapIntensity!==void 0)n.envMapIntensity=this.envMapIntensity;if(this.reflectivity!==void 0)n.reflectivity=this.reflectivity;if(this.refractionRatio!==void 0)n.refractionRatio=this.refractionRatio;if(this.gradientMap&&this.gradientMap.isTexture)n.gradientMap=this.gradientMap.toJSON(e).uuid;if(this.transmission!==void 0)n.transmission=this.transmission;if(this.transmissionMap&&this.transmissionMap.isTexture)n.transmissionMap=this.transmissionMap.toJSON(e).uuid;if(this.thickness!==void 0)n.thickness=this.thickness;if(this.thicknessMap&&this.thicknessMap.isTexture)n.thicknessMap=this.thicknessMap.toJSON(e).uuid;if(this.attenuationDistance!==void 0)n.attenuationDistance=this.attenuationDistance;if(this.attenuationColor!==void 0)n.attenuationColor=this.attenuationColor.getHex();if(this.size!==void 0)n.size=this.size;if(this.sizeAttenuation!==void 0)n.sizeAttenuation=this.sizeAttenuation;if(Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0)n.clippingPlanes=this.clippingPlanes.map((r)=>r.toJSON());if(this.rotation!==void 0)n.rotation=this.rotation;if(this.depthPacking!==void 0)n.depthPacking=this.depthPacking;if(this.linewidth!==void 0)n.linewidth=this.linewidth;if(this.linecap!==void 0)n.linecap=this.linecap;if(this.linejoin!==void 0)n.linejoin=this.linejoin;if(this.dashSize!==void 0)n.dashSize=this.dashSize;if(this.gapSize!==void 0)n.gapSize=this.gapSize;if(this.scale!==void 0)n.scale=this.scale;if(this.wireframe!==void 0)n.wireframe=this.wireframe;if(this.wireframeLinewidth!==void 0)n.wireframeLinewidth=this.wireframeLinewidth;if(this.wireframeLinecap!==void 0)n.wireframeLinecap=this.wireframeLinecap;if(this.wireframeLinejoin!==void 0)n.wireframeLinejoin=this.wireframeLinejoin;if(this.flatShading!==void 0)n.flatShading=this.flatShading;if(this.fog!==void 0)n.fog=this.fog;if(Object.keys(this.userData).length>0)n.userData=this.userData;function i(r){let s=[];for(let o in r){let a=r[o];delete a.metadata,s.push(a)}return s}if(t){let r=i(e.textures),s=i(e.images);if(r.length>0)n.textures=r;if(s.length>0)n.images=s}return n}fromJSON(e,t){if(e.uuid!==void 0)this.uuid=e.uuid;if(e.name!==void 0)this.name=e.name;if(e.color!==void 0&&this.color!==void 0)this.color.setHex(e.color);if(e.roughness!==void 0)this.roughness=e.roughness;if(e.metalness!==void 0)this.metalness=e.metalness;if(e.sheen!==void 0)this.sheen=e.sheen;if(e.sheenColor!==void 0)this.sheenColor=new Ie().setHex(e.sheenColor);if(e.sheenRoughness!==void 0)this.sheenRoughness=e.sheenRoughness;if(e.emissive!==void 0&&this.emissive!==void 0)this.emissive.setHex(e.emissive);if(e.specular!==void 0&&this.specular!==void 0)this.specular.setHex(e.specular);if(e.specularIntensity!==void 0)this.specularIntensity=e.specularIntensity;if(e.specularColor!==void 0&&this.specularColor!==void 0)this.specularColor.setHex(e.specularColor);if(e.shininess!==void 0)this.shininess=e.shininess;if(e.clearcoat!==void 0)this.clearcoat=e.clearcoat;if(e.clearcoatRoughness!==void 0)this.clearcoatRoughness=e.clearcoatRoughness;if(e.dispersion!==void 0)this.dispersion=e.dispersion;if(e.retroreflectivity!==void 0)this.retroreflectivity=e.retroreflectivity;if(e.iridescence!==void 0)this.iridescence=e.iridescence;if(e.iridescenceIOR!==void 0)this.iridescenceIOR=e.iridescenceIOR;if(e.iridescenceThicknessRange!==void 0)this.iridescenceThicknessRange=e.iridescenceThicknessRange;if(e.transmission!==void 0)this.transmission=e.transmission;if(e.thickness!==void 0)this.thickness=e.thickness;if(e.attenuationDistance!==void 0)this.attenuationDistance=e.attenuationDistance;if(e.attenuationColor!==void 0&&this.attenuationColor!==void 0)this.attenuationColor.setHex(e.attenuationColor);if(e.anisotropy!==void 0)this.anisotropy=e.anisotropy;if(e.anisotropyRotation!==void 0)this.anisotropyRotation=e.anisotropyRotation;if(e.fog!==void 0)this.fog=e.fog;if(e.flatShading!==void 0)this.flatShading=e.flatShading;if(e.blending!==void 0)this.blending=e.blending;if(e.combine!==void 0)this.combine=e.combine;if(e.side!==void 0)this.side=e.side;if(e.shadowSide!==void 0)this.shadowSide=e.shadowSide;if(e.opacity!==void 0)this.opacity=e.opacity;if(e.transparent!==void 0)this.transparent=e.transparent;if(e.alphaTest!==void 0)this.alphaTest=e.alphaTest;if(e.alphaHash!==void 0)this.alphaHash=e.alphaHash;if(e.depthFunc!==void 0)this.depthFunc=e.depthFunc;if(e.depthTest!==void 0)this.depthTest=e.depthTest;if(e.depthWrite!==void 0)this.depthWrite=e.depthWrite;if(e.colorWrite!==void 0)this.colorWrite=e.colorWrite;if(e.clippingPlanes!==void 0)this.clippingPlanes=e.clippingPlanes.map((n)=>new dn().fromJSON(n));if(e.clipIntersection!==void 0)this.clipIntersection=e.clipIntersection;if(e.clipShadows!==void 0)this.clipShadows=e.clipShadows;if(e.depthPacking!==void 0)this.depthPacking=e.depthPacking;if(e.blendSrc!==void 0)this.blendSrc=e.blendSrc;if(e.blendDst!==void 0)this.blendDst=e.blendDst;if(e.blendEquation!==void 0)this.blendEquation=e.blendEquation;if(e.blendSrcAlpha!==void 0)this.blendSrcAlpha=e.blendSrcAlpha;if(e.blendDstAlpha!==void 0)this.blendDstAlpha=e.blendDstAlpha;if(e.blendEquationAlpha!==void 0)this.blendEquationAlpha=e.blendEquationAlpha;if(e.blendColor!==void 0&&this.blendColor!==void 0)this.blendColor.setHex(e.blendColor);if(e.blendAlpha!==void 0)this.blendAlpha=e.blendAlpha;if(e.stencilWriteMask!==void 0)this.stencilWriteMask=e.stencilWriteMask;if(e.stencilFunc!==void 0)this.stencilFunc=e.stencilFunc;if(e.stencilRef!==void 0)this.stencilRef=e.stencilRef;if(e.stencilFuncMask!==void 0)this.stencilFuncMask=e.stencilFuncMask;if(e.stencilFail!==void 0)this.stencilFail=e.stencilFail;if(e.stencilZFail!==void 0)this.stencilZFail=e.stencilZFail;if(e.stencilZPass!==void 0)this.stencilZPass=e.stencilZPass;if(e.stencilWrite!==void 0)this.stencilWrite=e.stencilWrite;if(e.wireframe!==void 0)this.wireframe=e.wireframe;if(e.wireframeLinewidth!==void 0)this.wireframeLinewidth=e.wireframeLinewidth;if(e.wireframeLinecap!==void 0)this.wireframeLinecap=e.wireframeLinecap;if(e.wireframeLinejoin!==void 0)this.wireframeLinejoin=e.wireframeLinejoin;if(e.rotation!==void 0)this.rotation=e.rotation;if(e.linewidth!==void 0)this.linewidth=e.linewidth;if(e.linecap!==void 0)this.linecap=e.linecap;if(e.linejoin!==void 0)this.linejoin=e.linejoin;if(e.dashSize!==void 0)this.dashSize=e.dashSize;if(e.gapSize!==void 0)this.gapSize=e.gapSize;if(e.scale!==void 0)this.scale=e.scale;if(e.polygonOffset!==void 0)this.polygonOffset=e.polygonOffset;if(e.polygonOffsetFactor!==void 0)this.polygonOffsetFactor=e.polygonOffsetFactor;if(e.polygonOffsetUnits!==void 0)this.polygonOffsetUnits=e.polygonOffsetUnits;if(e.dithering!==void 0)this.dithering=e.dithering;if(e.alphaToCoverage!==void 0)this.alphaToCoverage=e.alphaToCoverage;if(e.premultipliedAlpha!==void 0)this.premultipliedAlpha=e.premultipliedAlpha;if(e.forceSinglePass!==void 0)this.forceSinglePass=e.forceSinglePass;if(e.allowOverride!==void 0)this.allowOverride=e.allowOverride;if(e.visible!==void 0)this.visible=e.visible;if(e.toneMapped!==void 0)this.toneMapped=e.toneMapped;if(e.userData!==void 0)this.userData=e.userData;if(e.vertexColors!==void 0)if(typeof e.vertexColors==="number")this.vertexColors=e.vertexColors>0;else this.vertexColors=e.vertexColors;if(e.size!==void 0)this.size=e.size;if(e.sizeAttenuation!==void 0)this.sizeAttenuation=e.sizeAttenuation;if(e.map!==void 0)this.map=t[e.map]||null;if(e.matcap!==void 0)this.matcap=t[e.matcap]||null;if(e.alphaMap!==void 0)this.alphaMap=t[e.alphaMap]||null;if(e.bumpMap!==void 0)this.bumpMap=t[e.bumpMap]||null;if(e.bumpScale!==void 0)this.bumpScale=e.bumpScale;if(e.normalMap!==void 0)this.normalMap=t[e.normalMap]||null;if(e.normalMapType!==void 0)this.normalMapType=e.normalMapType;if(e.normalScale!==void 0){let n=e.normalScale;if(Array.isArray(n)===!1)n=[n,n];this.normalScale=new ze().fromArray(n)}if(e.displacementMap!==void 0)this.displacementMap=t[e.displacementMap]||null;if(e.displacementScale!==void 0)this.displacementScale=e.displacementScale;if(e.displacementBias!==void 0)this.displacementBias=e.displacementBias;if(e.roughnessMap!==void 0)this.roughnessMap=t[e.roughnessMap]||null;if(e.metalnessMap!==void 0)this.metalnessMap=t[e.metalnessMap]||null;if(e.emissiveMap!==void 0)this.emissiveMap=t[e.emissiveMap]||null;if(e.emissiveIntensity!==void 0)this.emissiveIntensity=e.emissiveIntensity;if(e.specularMap!==void 0)this.specularMap=t[e.specularMap]||null;if(e.specularIntensityMap!==void 0)this.specularIntensityMap=t[e.specularIntensityMap]||null;if(e.specularColorMap!==void 0)this.specularColorMap=t[e.specularColorMap]||null;if(e.envMap!==void 0)this.envMap=t[e.envMap]||null;if(e.envMapRotation!==void 0)this.envMapRotation.fromArray(e.envMapRotation);if(e.envMapIntensity!==void 0)this.envMapIntensity=e.envMapIntensity;if(e.reflectivity!==void 0)this.reflectivity=e.reflectivity;if(e.refractionRatio!==void 0)this.refractionRatio=e.refractionRatio;if(e.lightMap!==void 0)this.lightMap=t[e.lightMap]||null;if(e.lightMapIntensity!==void 0)this.lightMapIntensity=e.lightMapIntensity;if(e.aoMap!==void 0)this.aoMap=t[e.aoMap]||null;if(e.aoMapIntensity!==void 0)this.aoMapIntensity=e.aoMapIntensity;if(e.gradientMap!==void 0)this.gradientMap=t[e.gradientMap]||null;if(e.clearcoatMap!==void 0)this.clearcoatMap=t[e.clearcoatMap]||null;if(e.clearcoatRoughnessMap!==void 0)this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null;if(e.clearcoatNormalMap!==void 0)this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null;if(e.clearcoatNormalScale!==void 0)this.clearcoatNormalScale=new ze().fromArray(e.clearcoatNormalScale);if(e.iridescenceMap!==void 0)this.iridescenceMap=t[e.iridescenceMap]||null;if(e.iridescenceThicknessMap!==void 0)this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null;if(e.transmissionMap!==void 0)this.transmissionMap=t[e.transmissionMap]||null;if(e.thicknessMap!==void 0)this.thicknessMap=t[e.thicknessMap]||null;if(e.anisotropyMap!==void 0)this.anisotropyMap=t[e.anisotropyMap]||null;if(e.sheenColorMap!==void 0)this.sheenColorMap=t[e.sheenColorMap]||null;if(e.sheenRoughnessMap!==void 0)this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null;return this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let i=t.length;n=Array(i);for(let r=0;r!==i;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){if(e===!0)this.version++}}var ei=new O,fc=new O,fo=new O,po=new O;class Ji{constructor(e=new O,t=new O(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,ei)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);if(n<0)return t.copy(this.origin);return t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=ei.subVectors(e,this.origin).dot(this.direction);if(t<0)return this.origin.distanceToSquared(e);return ei.copy(this.origin).addScaledVector(this.direction,t),ei.distanceToSquared(e)}distanceSqToSegment(e,t,n,i){fc.copy(e).add(t).multiplyScalar(0.5),fo.copy(t).sub(e).normalize(),po.copy(this.origin).sub(fc);let r=e.distanceTo(t)*0.5,s=-this.direction.dot(fo),o=po.dot(this.direction),a=-po.dot(fo),c=po.lengthSq(),l=Math.abs(1-s*s),u,d,h,f;if(l>0)if(u=s*a-o,d=s*o-a,f=r*l,u>=0)if(d>=-f)if(d<=f){let g=1/l;u*=g,d*=g,h=u*(u+s*d+2*o)+d*(s*u+d+2*a)+c}else d=r,u=Math.max(0,-(s*d+o)),h=-u*u+d*(d+2*a)+c;else d=-r,u=Math.max(0,-(s*d+o)),h=-u*u+d*(d+2*a)+c;else if(d<=-f)u=Math.max(0,-(-s*r+o)),d=u>0?-r:Math.min(Math.max(-r,-a),r),h=-u*u+d*(d+2*a)+c;else if(d<=f)u=0,d=Math.min(Math.max(-r,-a),r),h=d*(d+2*a)+c;else u=Math.max(0,-(s*r+o)),d=u>0?r:Math.min(Math.max(-r,-a),r),h=-u*u+d*(d+2*a)+c;else d=s>0?-r:r,u=Math.max(0,-(s*d+o)),h=-u*u+d*(d+2*a)+c;if(n)n.copy(this.origin).addScaledVector(this.direction,u);if(i)i.copy(fc).addScaledVector(fo,d);return h}intersectSphere(e,t){if(e.radius<0)return null;ei.subVectors(e.center,this.origin);let n=ei.dot(this.direction),i=ei.dot(ei)-n*n,r=e.radius*e.radius;if(i>r)return null;let s=Math.sqrt(r-i),o=n-s,a=n+s;if(a<0)return null;if(o<0)return this.at(a,t);return this.at(o,t)}intersectsSphere(e){if(e.radius<0)return!1;return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0){if(e.distanceToPoint(this.origin)===0)return 0;return null}let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);if(n===null)return null;return this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);if(t===0)return!0;if(e.normal.dot(this.direction)*t<0)return!0;return!1}intersectBox(e,t){let n,i,r,s,o,a,c=1/this.direction.x,l=1/this.direction.y,u=1/this.direction.z,d=this.origin;if(c>=0)n=(e.min.x-d.x)*c,i=(e.max.x-d.x)*c;else n=(e.max.x-d.x)*c,i=(e.min.x-d.x)*c;if(l>=0)r=(e.min.y-d.y)*l,s=(e.max.y-d.y)*l;else r=(e.max.y-d.y)*l,s=(e.min.y-d.y)*l;if(n>s||r>i)return null;if(r>n||isNaN(n))n=r;if(s<i||isNaN(i))i=s;if(u>=0)o=(e.min.z-d.z)*u,a=(e.max.z-d.z)*u;else o=(e.max.z-d.z)*u,a=(e.min.z-d.z)*u;if(n>a||o>i)return null;if(o>n||n!==n)n=o;if(a<i||i!==i)i=a;if(i<0)return null;return this.at(n>=0?n:i,t)}intersectsBox(e){return this.intersectBox(e,ei)!==null}intersectTriangle(e,t,n,i,r){let s=this.origin,o=this.direction,{x:a,y:c,z:l}=o,u=e.x-s.x,d=e.y-s.y,h=e.z-s.z,f=t.x-s.x,g=t.y-s.y,S=t.z-s.z,p=n.x-s.x,m=n.y-s.y,T=n.z-s.z,A=Math.abs(a),v=Math.abs(c),w=Math.abs(l),E,R,x,M,H,U,z,N,C,F,V,G;if(A>=v&&A>=w)if(x=a,U=u,C=f,G=p,a>=0)E=c,R=l,M=d,H=h,z=g,N=S,F=m,V=T;else E=l,R=c,M=h,H=d,z=S,N=g,F=T,V=m;else if(v>=w)if(x=c,U=d,C=g,G=m,c>=0)E=l,R=a,M=h,H=u,z=S,N=f,F=T,V=p;else E=a,R=l,M=u,H=h,z=f,N=S,F=p,V=T;else if(x=l,U=h,C=S,G=T,l>=0)E=a,R=c,M=u,H=d,z=f,N=g,F=p,V=m;else E=c,R=a,M=d,H=u,z=g,N=f,F=m,V=p;if(x===0)return null;let ie=E/x,X=R/x,Q=1/x,ee=M-ie*U,ve=H-X*U,Ee=z-ie*C,qe=N-X*C,ke=F-ie*G,q=V-X*G,re=ke*qe-q*Ee,se=ee*q-ve*ke,Pe=Ee*ve-qe*ee;if(i){if(re<0||se<0||Pe<0)return null}else if((re<0||se<0||Pe<0)&&(re>0||se>0||Pe>0))return null;let Ne=re+se+Pe;if(Ne===0)return null;let Re=Q*(re*U+se*C+Pe*G);if(Ne>0?Re<0:Re>0)return null;return this.at(Re/Ne,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class kn extends on{constructor(e){super();this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ie(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ii,this.combine=0,this.reflectivity=1,this.refractionRatio=0.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}var wp=new Oe,Bi=new Ji,mo=new sn,Tp=new O,go=new O,_o=new O,xo=new O,pc=new O,vo=new O,Ep=new O,yo=new O;class vt extends dt{constructor(e=new Tt,t=new kn){super();this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){if(super.copy(e,t),e.morphTargetInfluences!==void 0)this.morphTargetInfluences=e.morphTargetInfluences.slice();if(e.morphTargetDictionary!==void 0)this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary);return this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,s=i.length;r<s;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(e,t){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,s=n.morphTargetsRelative;t.fromBufferAttribute(i,e);let o=this.morphTargetInfluences;if(r&&o){vo.set(0,0,0);for(let a=0,c=r.length;a<c;a++){let l=o[a],u=r[a];if(l===0)continue;if(pc.fromBufferAttribute(u,e),s)vo.addScaledVector(pc,l);else vo.addScaledVector(pc.sub(t),l)}t.add(vo)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,i=this.material,r=this.matrixWorld;if(i===void 0)return;if(n.boundingSphere===null)n.computeBoundingSphere();if(mo.copy(n.boundingSphere),mo.applyMatrix4(r),Bi.copy(e.ray).recast(e.near),mo.containsPoint(Bi.origin)===!1){if(Bi.intersectSphere(mo,Tp)===null)return;if(Bi.origin.distanceToSquared(Tp)>(e.far-e.near)**2)return}if(wp.copy(r).invert(),Bi.copy(e.ray).applyMatrix4(wp),n.boundingBox!==null){if(Bi.intersectsBox(n.boundingBox)===!1)return}this._computeIntersections(e,t,Bi)}_computeIntersections(e,t,n){let i,r=this.geometry,s=this.material,o=r.index,a=r.attributes.position,c=r.attributes.uv,l=r.attributes.uv1,u=r.attributes.normal,{groups:d,drawRange:h}=r;if(o!==null)if(Array.isArray(s))for(let f=0,g=d.length;f<g;f++){let S=d[f],p=s[S.materialIndex],m=Math.max(S.start,h.start),T=Math.min(o.count,Math.min(S.start+S.count,h.start+h.count));for(let A=m,v=T;A<v;A+=3){let w=o.getX(A),E=o.getX(A+1),R=o.getX(A+2);if(i=So(this,p,e,n,c,l,u,w,E,R),i)i.faceIndex=Math.floor(A/3),i.face.materialIndex=S.materialIndex,t.push(i)}}else{let f=Math.max(0,h.start),g=Math.min(o.count,h.start+h.count);for(let S=f,p=g;S<p;S+=3){let m=o.getX(S),T=o.getX(S+1),A=o.getX(S+2);if(i=So(this,s,e,n,c,l,u,m,T,A),i)i.faceIndex=Math.floor(S/3),t.push(i)}}else if(a!==void 0)if(Array.isArray(s))for(let f=0,g=d.length;f<g;f++){let S=d[f],p=s[S.materialIndex],m=Math.max(S.start,h.start),T=Math.min(a.count,Math.min(S.start+S.count,h.start+h.count));for(let A=m,v=T;A<v;A+=3){let w=A,E=A+1,R=A+2;if(i=So(this,p,e,n,c,l,u,w,E,R),i)i.faceIndex=Math.floor(A/3),i.face.materialIndex=S.materialIndex,t.push(i)}}else{let f=Math.max(0,h.start),g=Math.min(a.count,h.start+h.count);for(let S=f,p=g;S<p;S+=3){let m=S,T=S+1,A=S+2;if(i=So(this,s,e,n,c,l,u,m,T,A),i)i.faceIndex=Math.floor(S/3),t.push(i)}}}}function Tx(e,t,n,i,r,s,o,a){let c;if(t.side===1)c=i.intersectTriangle(o,s,r,!0,a);else c=i.intersectTriangle(r,s,o,t.side===0,a);if(c===null)return null;yo.copy(a),yo.applyMatrix4(e.matrixWorld);let l=n.ray.origin.distanceTo(yo);if(l<n.near||l>n.far)return null;return{distance:l,point:yo.clone(),object:e}}function So(e,t,n,i,r,s,o,a,c,l){e.getVertexPosition(a,go),e.getVertexPosition(c,_o),e.getVertexPosition(l,xo);let u=Tx(e,t,n,i,go,_o,xo,Ep);if(u){let d=new O;if(fn.getBarycoord(Ep,go,_o,xo,d),r)u.uv=fn.getInterpolatedAttribute(r,a,c,l,d,new ze);if(s)u.uv1=fn.getInterpolatedAttribute(s,a,c,l,d,new ze);if(o){if(u.normal=fn.getInterpolatedAttribute(o,a,c,l,d,new O),u.normal.dot(i.direction)>0)u.normal.multiplyScalar(-1)}let h={a,b:c,c:l,normal:new O,materialIndex:0};fn.getNormal(go,_o,xo,h.normal),u.face=h,u.barycoord=d}return u}var ns=new ot,Ap=new ot,Rp=new ot,Ex=new ot,Cp=new Oe,bo=new O,mc=new sn,Ip=new Oe,gc=new Ji;class Ko extends vt{constructor(e,t){super(e,t);this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode="attached",this.bindMatrix=new Oe,this.bindMatrixInverse=new Oe,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){let e=this.geometry;if(this.boundingBox===null)this.boundingBox=new gn;this.boundingBox.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,bo),this.boundingBox.expandByPoint(bo)}computeBoundingSphere(){let e=this.geometry;if(this.boundingSphere===null)this.boundingSphere=new sn;this.boundingSphere.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,bo),this.boundingSphere.expandByPoint(bo)}copy(e,t){if(super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,e.boundingBox!==null)this.boundingBox=e.boundingBox.clone();if(e.boundingSphere!==null)this.boundingSphere=e.boundingSphere.clone();return this}raycast(e,t){let n=this.material,i=this.matrixWorld;if(n===void 0)return;if(this.boundingSphere===null)this.computeBoundingSphere();if(mc.copy(this.boundingSphere),mc.applyMatrix4(i),e.ray.intersectsSphere(mc)===!1)return;if(Ip.copy(i).invert(),gc.copy(e.ray).applyMatrix4(Ip),this.boundingBox!==null){if(gc.intersectsBox(this.boundingBox)===!1)return}this._computeIntersections(e,t,gc)}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){if(this.skeleton=e,t===void 0)this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld;this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let e=new ot,t=this.geometry.attributes.skinWeight;for(let n=0,i=t.count;n<i;n++){e.fromBufferAttribute(t,n);let r=1/e.manhattanLength();if(r!==1/0)e.multiplyScalar(r);else e.set(1,0,0,0);t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){if(super.updateMatrixWorld(e),this.bindMode==="attached")this.bindMatrixInverse.copy(this.matrixWorld).invert();else if(this.bindMode==="detached")this.bindMatrixInverse.copy(this.bindMatrix).invert();else Te("SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(e,t){let n=this.skeleton,i=this.geometry;if(Ap.fromBufferAttribute(i.attributes.skinIndex,e),Rp.fromBufferAttribute(i.attributes.skinWeight,e),t.isVector4)ns.copy(t),t.set(0,0,0,0);else ns.set(...t,1),t.set(0,0,0);ns.applyMatrix4(this.bindMatrix);for(let r=0;r<4;r++){let s=Rp.getComponent(r);if(s!==0){let o=Ap.getComponent(r);Cp.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),t.addScaledVector(Ex.copy(ns).applyMatrix4(Cp),s)}}if(t.isVector4)t.w=ns.w;return t.applyMatrix4(this.bindMatrixInverse)}}class xs extends dt{constructor(){super();this.isBone=!0,this.type="Bone"}}class vs extends St{constructor(e=null,t=1,n=1,i,r,s,o,a,c=1003,l=1003,u,d){super(null,s,o,a,c,l,i,r,u,d);this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}var Pp=new Oe,Ax=new Oe;class ys{constructor(e=[],t=[]){this.uuid=Mn(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){let e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(e.length*16),t.length===0)this.calculateInverses();else if(e.length!==t.length){Te("Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new Oe)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){let n=new Oe;if(this.bones[e])n.copy(this.bones[e].matrixWorld).invert();this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];if(n)n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];if(n){if(n.parent&&n.parent.isBone)n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld);else n.matrix.copy(n.matrixWorld);n.matrix.decompose(n.position,n.quaternion,n.scale)}}}update(){let e=this.bones,t=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,s=e.length;r<s;r++){let o=e[r]?e[r].matrixWorld:Ax;Pp.multiplyMatrices(o,t[r]),Pp.toArray(n,r*16)}if(i!==null)i.needsUpdate=!0}clone(){return new ys(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(this.bones.length*4);e=Math.ceil(e/4)*4,e=Math.max(e,4);let t=new Float32Array(e*e*4);t.set(this.boneMatrices);let n=new vs(t,e,e,1023,1015);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){let i=this.bones[t];if(i.name===e)return i}return}dispose(){if(this.boneTexture!==null)this.boneTexture.dispose(),this.boneTexture=null}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,i=e.bones.length;n<i;n++){let r=e.bones[n],s=t[r];if(s===void 0)Te("Skeleton: No bone found with UUID:",r),s=new xs;this.bones.push(s),this.boneInverses.push(new Oe().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){let e={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;let t=this.bones,n=this.boneInverses;for(let i=0,r=t.length;i<r;i++){let s=t[i];e.bones.push(s.uuid);let o=n[i];e.boneInverses.push(o.toArray())}return e}}class Si extends Ft{constructor(e,t,n,i=1){super(e,t,n);this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}var vr=new Oe,Lp=new Oe,Mo=[],Np=new gn,Rx=new Oe,is=new vt,rs=new sn;class jo extends vt{constructor(e,t,n){super(e,t);this.isInstancedMesh=!0,this.instanceMatrix=new Si(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,Rx)}computeBoundingBox(){let e=this.geometry,t=this.count;if(this.boundingBox===null)this.boundingBox=new gn;if(e.boundingBox===null)e.computeBoundingBox();this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,vr),Np.copy(e.boundingBox).applyMatrix4(vr),this.boundingBox.union(Np)}computeBoundingSphere(){let e=this.geometry,t=this.count;if(this.boundingSphere===null)this.boundingSphere=new sn;if(e.boundingSphere===null)e.computeBoundingSphere();this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,vr),rs.copy(e.boundingSphere).applyMatrix4(vr),this.boundingSphere.union(rs)}copy(e,t){if(super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null)this.morphTexture=e.morphTexture.clone();if(e.instanceColor!==null)this.instanceColor=e.instanceColor.clone();if(this.count=e.count,e.boundingBox!==null)this.boundingBox=e.boundingBox.clone();if(e.boundingSphere!==null)this.boundingSphere=e.boundingSphere.clone();return this}getColorAt(e,t){if(this.instanceColor===null)return t.setRGB(1,1,1);else return t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let n=t.morphTargetInfluences,i=this.morphTexture.source.data.data,r=n.length+1,s=e*r+1;for(let o=0;o<n.length;o++)n[o]=i[s+o]}raycast(e,t){let n=this.matrixWorld,i=this.count;if(is.geometry=this.geometry,is.material=this.material,is.material===void 0)return;if(this.boundingSphere===null)this.computeBoundingSphere();if(rs.copy(this.boundingSphere),rs.applyMatrix4(n),e.ray.intersectsSphere(rs)===!1)return;for(let r=0;r<i;r++){this.getMatrixAt(r,vr),Lp.multiplyMatrices(n,vr),is.matrixWorld=Lp,is.raycast(e,Mo);for(let s=0,o=Mo.length;s<o;s++){let a=Mo[s];a.instanceId=r,a.object=this,t.push(a)}Mo.length=0}}setColorAt(e,t){if(this.instanceColor===null)this.instanceColor=new Si(new Float32Array(this.instanceMatrix.count*3).fill(1),3);return t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){let n=t.morphTargetInfluences,i=n.length+1;if(this.morphTexture===null)this.morphTexture=new vs(new Float32Array(i*this.count),i,this.count,1028,1015);let r=this.morphTexture.source.data.data,s=0;for(let c=0;c<n.length;c++)s+=n[c];let o=this.geometry.morphTargetsRelative?1:1-s,a=i*e;return r[a]=o,r.set(n,a+1),this}updateMorphTargets(){}dispose(){if(super.dispose(),this.morphTexture!==null)this.morphTexture.dispose(),this.morphTexture=null}}var Gi=new sn,Cx=new ze(0.5,0.5),wo=new O;class Ss{constructor(e=new dn,t=new dn,n=new dn,i=new dn,r=new dn,s=new dn){this.planes=[e,t,n,i,r,s]}set(e,t,n,i,r,s){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(i),o[4].copy(r),o[5].copy(s),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=2000,n=!1){let i=this.planes,r=e.elements,s=r[0],o=r[1],a=r[2],c=r[3],l=r[4],u=r[5],d=r[6],h=r[7],f=r[8],g=r[9],S=r[10],p=r[11],m=r[12],T=r[13],A=r[14],v=r[15];if(i[0].setComponents(c-s,h-l,p-f,v-m).normalize(),i[1].setComponents(c+s,h+l,p+f,v+m).normalize(),i[2].setComponents(c+o,h+u,p+g,v+T).normalize(),i[3].setComponents(c-o,h-u,p-g,v-T).normalize(),n)i[4].setComponents(a,d,S,A).normalize(),i[5].setComponents(c-a,h-d,p-S,v-A).normalize();else if(i[4].setComponents(c-a,h-d,p-S,v-A).normalize(),t===2000)i[5].setComponents(c+a,h+d,p+S,v+A).normalize();else if(t===2001)i[5].setComponents(a,d,S,A).normalize();else throw Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0){if(e.boundingSphere===null)e.computeBoundingSphere();Gi.copy(e.boundingSphere).applyMatrix4(e.matrixWorld)}else{let t=e.geometry;if(t.boundingSphere===null)t.computeBoundingSphere();Gi.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Gi)}intersectsSprite(e){Gi.center.set(0,0,0);let t=Cx.distanceTo(e.center);return Gi.radius=0.7071067811865476+t,Gi.applyMatrix4(e.matrixWorld),this.intersectsSphere(Gi)}intersectsSphere(e){let t=this.planes,n=e.center,i=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let i=t[n];if(wo.x=i.normal.x>0?e.max.x:e.min.x,wo.y=i.normal.y>0?e.max.y:e.min.y,wo.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(wo)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Ti extends on{constructor(e){super();this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Ie(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}}var Lo=new O,No=new O,Dp=new Oe,ss=new Ji,To=new sn,_c=new O,Up=new O;class Bn extends dt{constructor(e=new Tt,t=new Ti){super();this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let i=1,r=t.count;i<r;i++)Lo.fromBufferAttribute(t,i-1),No.fromBufferAttribute(t,i),n[i]=n[i-1],n[i]+=Lo.distanceTo(No);e.setAttribute("lineDistance",new bt(n,1))}else Te("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Line.threshold,s=n.drawRange;if(n.boundingSphere===null)n.computeBoundingSphere();if(To.copy(n.boundingSphere),To.applyMatrix4(i),To.radius+=r,e.ray.intersectsSphere(To)===!1)return;Dp.copy(i).invert(),ss.copy(e.ray).applyMatrix4(Dp);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),a=o*o,c=this.isLineSegments?2:1,l=n.index,d=n.attributes.position;if(l!==null){let h=Math.max(0,s.start),f=Math.min(l.count,s.start+s.count);for(let g=h,S=f-1;g<S;g+=c){let p=l.getX(g),m=l.getX(g+1),T=Eo(this,e,ss,a,p,m,g);if(T)t.push(T)}if(this.isLineLoop){let g=l.getX(f-1),S=l.getX(h),p=Eo(this,e,ss,a,g,S,f-1);if(p)t.push(p)}}else{let h=Math.max(0,s.start),f=Math.min(d.count,s.start+s.count);for(let g=h,S=f-1;g<S;g+=c){let p=Eo(this,e,ss,a,g,g+1,g);if(p)t.push(p)}if(this.isLineLoop){let g=Eo(this,e,ss,a,f-1,h,f-1);if(g)t.push(g)}}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,s=i.length;r<s;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function Eo(e,t,n,i,r,s,o){let a=e.geometry.attributes.position;if(Lo.fromBufferAttribute(a,r),No.fromBufferAttribute(a,s),n.distanceSqToSegment(Lo,No,_c,Up)>i)return;_c.applyMatrix4(e.matrixWorld);let l=t.ray.origin.distanceTo(_c);if(l<t.near||l>t.far)return;return{distance:l,point:Up.clone().applyMatrix4(e.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:e}}var Op=new O,Fp=new O;class bs extends Bn{constructor(e,t){super(e,t);this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let i=0,r=t.count;i<r;i+=2)Op.fromBufferAttribute(t,i),Fp.fromBufferAttribute(t,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+Op.distanceTo(Fp);e.setAttribute("lineDistance",new bt(n,1))}else Te("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class Qo extends Bn{constructor(e,t){super(e,t);this.isLineLoop=!0,this.type="LineLoop"}}class Ms extends on{constructor(e){super();this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Ie(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}var zp=new Oe,yc=new Ji,Ao=new sn,Ro=new O;class Ur extends dt{constructor(e=new Tt,t=new Ms){super();this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Points.threshold,s=n.drawRange;if(n.boundingSphere===null)n.computeBoundingSphere();if(Ao.copy(n.boundingSphere),Ao.applyMatrix4(i),Ao.radius+=r,e.ray.intersectsSphere(Ao)===!1)return;zp.copy(i).invert(),yc.copy(e.ray).applyMatrix4(zp);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),a=o*o,c=n.index,u=n.attributes.position;if(c!==null){let d=Math.max(0,s.start),h=Math.min(c.count,s.start+s.count);for(let f=d,g=h;f<g;f++){let S=c.getX(f);Ro.fromBufferAttribute(u,S),kp(Ro,S,a,i,e,t,this)}}else{let d=Math.max(0,s.start),h=Math.min(u.count,s.start+s.count);for(let f=d,g=h;f<g;f++)Ro.fromBufferAttribute(u,f),kp(Ro,f,a,i,e,t,this)}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,s=i.length;r<s;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function kp(e,t,n,i,r,s,o){let a=yc.distanceSqToPoint(e);if(a<n){let c=new O;yc.closestPointToPoint(e,c),c.applyMatrix4(i);let l=r.ray.origin.distanceTo(c);if(l<r.near||l>r.far)return;s.push({distance:l,distanceToRay:Math.sqrt(a),point:c,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}class ea extends St{constructor(e=[],t=301,n,i,r,s,o,a,c,l){super(e,t,n,i,r,s,o,a,c,l);this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Ki extends St{constructor(e,t,n=1014,i,r,s,o=1003,a=1003,c,l=1026,u=1){if(l!==1026&&l!==1027)throw Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let d={width:e,height:t,depth:u};super(d,i,r,s,o,a,l,n,c);this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new ps(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}}class Al extends Ki{constructor(e,t=1014,n=301,i,r,s=1003,o=1003,a,c=1026){let l={width:e,height:e,depth:1},u=[l,l,l,l,l,l];super(e,e,t,n,i,r,s,o,a,c);this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class ta extends St{constructor(e=null){super();this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class Ei extends Tt{constructor(e=1,t=1,n=1,i=1,r=1,s=1){super();this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:r,depthSegments:s};let o=this;i=Math.floor(i),r=Math.floor(r),s=Math.floor(s);let a=[],c=[],l=[],u=[],d=0,h=0;f("z","y","x",-1,-1,n,t,e,s,r,0),f("z","y","x",1,-1,n,t,-e,s,r,1),f("x","z","y",1,1,e,n,t,i,s,2),f("x","z","y",1,-1,e,n,-t,i,s,3),f("x","y","z",1,-1,e,t,n,i,r,4),f("x","y","z",-1,-1,e,t,-n,i,r,5),this.setIndex(a),this.setAttribute("position",new bt(c,3)),this.setAttribute("normal",new bt(l,3)),this.setAttribute("uv",new bt(u,2));function f(g,S,p,m,T,A,v,w,E,R,x){let M=A/E,H=v/R,U=A/2,z=v/2,N=w/2,C=E+1,F=R+1,V=0,G=0,ie=new O;for(let X=0;X<F;X++){let Q=X*H-z;for(let ee=0;ee<C;ee++){let ve=ee*M-U;ie[g]=ve*m,ie[S]=Q*T,ie[p]=N,c.push(ie.x,ie.y,ie.z),ie[g]=0,ie[S]=0,ie[p]=w>0?1:-1,l.push(ie.x,ie.y,ie.z),u.push(ee/E),u.push(1-X/R),V+=1}}for(let X=0;X<R;X++)for(let Q=0;Q<E;Q++){let ee=d+Q+C*X,ve=d+Q+C*(X+1),Ee=d+(Q+1)+C*(X+1),qe=d+(Q+1)+C*X;a.push(ee,ve,qe),a.push(ve,Ee,qe),G+=6}o.addGroup(h,G,x),h+=G,d+=V}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Ei(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class ji extends Tt{constructor(e=1,t=1,n=4,i=8,r=1){super();this.type="CapsuleGeometry",this.parameters={radius:e,height:t,capSegments:n,radialSegments:i,heightSegments:r},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),i=Math.max(3,Math.floor(i)),r=Math.max(1,Math.floor(r));let s=[],o=[],a=[],c=[],l=t/2,u=Math.PI/2*e,d=t,h=2*u+d,f=n*2+r,g=i+1,S=new O,p=new O;for(let m=0;m<=f;m++){let T=0,A=0,v=0,w=0;if(m<=n){let x=m/n,M=x*Math.PI/2;A=-l-e*Math.cos(M),v=e*Math.sin(M),w=-e*Math.cos(M),T=x*u}else if(m<=n+r){let x=(m-n)/r;A=-l+x*t,v=e,w=0,T=u+x*d}else{let x=(m-n-r)/n,M=x*Math.PI/2;A=l+e*Math.sin(M),v=e*Math.cos(M),w=e*Math.sin(M),T=u+d+x*u}let E=Math.max(0,Math.min(1,T/h)),R=0;if(m===0)R=0.5/i;else if(m===f)R=-0.5/i;for(let x=0;x<=i;x++){let M=x/i,H=M*Math.PI*2,U=Math.sin(H),z=Math.cos(H);p.x=-v*z,p.y=A,p.z=v*U,o.push(p.x,p.y,p.z),S.set(-v*z,w,v*U),S.normalize(),a.push(S.x,S.y,S.z),c.push(M+R,E)}if(m>0){let x=(m-1)*g;for(let M=0;M<i;M++){let H=x+M,U=x+M+1,z=m*g+M,N=m*g+M+1;s.push(H,U,z),s.push(U,N,z)}}}this.setIndex(s),this.setAttribute("position",new bt(o,3)),this.setAttribute("normal",new bt(a,3)),this.setAttribute("uv",new bt(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ji(e.radius,e.height,e.capSegments,e.radialSegments,e.heightSegments)}}class ws extends Tt{constructor(e=1,t=1,n=1,i=1){super();this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};let r=e/2,s=t/2,o=Math.floor(n),a=Math.floor(i),c=o+1,l=a+1,u=e/o,d=t/a,h=[],f=[],g=[],S=[];for(let p=0;p<l;p++){let m=p*d-s;for(let T=0;T<c;T++){let A=T*u-r;f.push(A,-m,0),g.push(0,0,1),S.push(T/o),S.push(1-p/a)}}for(let p=0;p<a;p++)for(let m=0;m<o;m++){let T=m+c*p,A=m+c*(p+1),v=m+1+c*(p+1),w=m+1+c*p;h.push(T,A,w),h.push(A,v,w)}this.setIndex(h),this.setAttribute("position",new bt(f,3)),this.setAttribute("normal",new bt(g,3)),this.setAttribute("uv",new bt(S,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ws(e.width,e.height,e.widthSegments,e.heightSegments)}}class Ts extends Tt{constructor(e=1,t=32,n=16,i=0,r=Math.PI*2,s=0,o=Math.PI){super();this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:i,phiLength:r,thetaStart:s,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let a=Math.min(s+o,Math.PI),c=0,l=[],u=new O,d=new O,h=[],f=[],g=[],S=[];for(let p=0;p<=n;p++){let m=[],T=p/n,A=s+T*o,v=e*Math.cos(A),w=Math.sqrt(e*e-v*v),E=0;if(p===0&&s===0)E=0.5/t;else if(p===n&&a===Math.PI)E=-0.5/t;for(let R=0;R<=t;R++){let x=R/t,M=i+x*r;u.x=-w*Math.cos(M),u.y=v,u.z=w*Math.sin(M),f.push(u.x,u.y,u.z),d.copy(u).normalize(),g.push(d.x,d.y,d.z),S.push(x+E,1-T),m.push(c++)}l.push(m)}for(let p=0;p<n;p++)for(let m=0;m<t;m++){let T=l[p][m+1],A=l[p][m],v=l[p+1][m],w=l[p+1][m+1];if(p!==0||s>0)h.push(T,A,w);if(p!==n-1||a<Math.PI)h.push(A,v,w)}this.setIndex(h),this.setAttribute("position",new bt(f,3)),this.setAttribute("normal",new bt(g,3)),this.setAttribute("uv",new bt(S,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Ts(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}function Qi(e){let t={};for(let n in e){t[n]={};for(let i in e[n]){let r=e[n][i];if(Bp(r))if(r.isRenderTargetTexture)Te("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[n][i]=null;else t[n][i]=r.clone();else if(Array.isArray(r))if(Bp(r[0])){let s=[];for(let o=0,a=r.length;o<a;o++)s[o]=r[o].clone();t[n][i]=s}else t[n][i]=r.slice();else t[n][i]=r}}return t}function $t(e){let t={};for(let n=0;n<e.length;n++){let i=Qi(e[n]);for(let r in i)t[r]=i[r]}return t}function Bp(e){return e&&(e.isColor||e.isMatrix3||e.isMatrix4||e.isVector2||e.isVector3||e.isVector4||e.isTexture||e.isQuaternion)}function Ix(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function Rl(e){let t=e.getRenderTarget();if(t===null)return e.outputColorSpace;if(t.isXRRenderTarget===!0)return t.texture.colorSpace;return He.workingColorSpace}var Ym={clone:Qi,merge:$t},Px=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Lx=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class _n extends on{constructor(e){super();if(this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Px,this.fragmentShader=Lx,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0)this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Qi(e.uniforms),this.uniformsGroups=Ix(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let i in this.uniforms){let s=this.uniforms[i].value;if(s&&s.isTexture)t.uniforms[i]={type:"t",value:s.toJSON(e).uuid};else if(s&&s.isColor)t.uniforms[i]={type:"c",value:s.getHex()};else if(s&&s.isVector2)t.uniforms[i]={type:"v2",value:s.toArray()};else if(s&&s.isVector3)t.uniforms[i]={type:"v3",value:s.toArray()};else if(s&&s.isVector4)t.uniforms[i]={type:"v4",value:s.toArray()};else if(s&&s.isMatrix3)t.uniforms[i]={type:"m3",value:s.toArray()};else if(s&&s.isMatrix4)t.uniforms[i]={type:"m4",value:s.toArray()};else t.uniforms[i]={value:s}}if(Object.keys(this.defines).length>0)t.defines=this.defines;t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let i in this.extensions)if(this.extensions[i]===!0)n[i]=!0;if(Object.keys(n).length>0)t.extensions=n;return t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let n in e.uniforms){let i=e.uniforms[n];switch(this.uniforms[n]={},i.type){case"t":this.uniforms[n].value=t[i.value]||null;break;case"c":this.uniforms[n].value=new Ie().setHex(i.value);break;case"v2":this.uniforms[n].value=new ze().fromArray(i.value);break;case"v3":this.uniforms[n].value=new O().fromArray(i.value);break;case"v4":this.uniforms[n].value=new ot().fromArray(i.value);break;case"m3":this.uniforms[n].value=new Ue().fromArray(i.value);break;case"m4":this.uniforms[n].value=new Oe().fromArray(i.value);break;default:this.uniforms[n].value=i.value}}if(e.defines!==void 0)this.defines=e.defines;if(e.vertexShader!==void 0)this.vertexShader=e.vertexShader;if(e.fragmentShader!==void 0)this.fragmentShader=e.fragmentShader;if(e.glslVersion!==void 0)this.glslVersion=e.glslVersion;if(e.extensions!==void 0)for(let n in e.extensions)this.extensions[n]=e.extensions[n];if(e.lights!==void 0)this.lights=e.lights;if(e.clipping!==void 0)this.clipping=e.clipping;return this}}class Cl extends _n{constructor(e){super(e);this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class Gn extends on{constructor(e){super();this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Ie(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ie(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new ze(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ii,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class an extends Gn{constructor(e){super();this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new ze(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return $e(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(t){this.ior=(1+0.4*t)/(1-0.4*t)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new Ie(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new Ie(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new Ie(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._retroreflectivity=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){if(this._anisotropy>0!==e>0)this.version++;this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){if(this._clearcoat>0!==e>0)this.version++;this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){if(this._iridescence>0!==e>0)this.version++;this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){if(this._dispersion>0!==e>0)this.version++;this._dispersion=e}get retroreflectivity(){return this._retroreflectivity}set retroreflectivity(e){if(this._retroreflectivity>0!==e>0)this.version++;this._retroreflectivity=e}get sheen(){return this._sheen}set sheen(e){if(this._sheen>0!==e>0)this.version++;this._sheen=e}get transmission(){return this._transmission}set transmission(e){if(this._transmission>0!==e>0)this.version++;this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.retroreflectivity=e.retroreflectivity,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}}class Es extends on{constructor(e){super();this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=3200,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Il extends on{constructor(e){super();this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}function yi(e,t){if(!e||e.constructor===t)return e;if(typeof t.BYTES_PER_ELEMENT==="number")return new t(e);return Array.prototype.slice.call(e)}function Po(e){return e!==void 0&&e.inTangents!==void 0&&e.outTangents!==void 0}function Nx(e){function t(r,s){return e[r]-e[s]}let n=e.length,i=Array(n);for(let r=0;r!==n;++r)i[r]=r;return i.sort(t),i}function Gp(e,t,n){let i=e.length,r=new e.constructor(i);for(let s=0,o=0;o!==i;++s){let a=n[s]*t;for(let c=0;c!==t;++c)r[o++]=e[a+c]}return r}function Dx(e,t,n,i){let r=1,s=e[0];while(s!==void 0&&s[i]===void 0)s=e[r++];if(s===void 0)return;let o=s[i];if(o===void 0)return;if(Array.isArray(o))do{if(o=s[i],o!==void 0)t.push(s.time),n.push(...o);s=e[r++]}while(s!==void 0);else if(o.toArray!==void 0)do{if(o=s[i],o!==void 0)t.push(s.time),o.toArray(n,n.length);s=e[r++]}while(s!==void 0);else do{if(o=s[i],o!==void 0)t.push(s.time),n.push(o);s=e[r++]}while(s!==void 0)}class oi{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,i=t[n],r=t[n-1];e:{t:{let s;n:{i:if(!(e<i)){for(let o=n+2;;){if(i===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=i,i=t[++n],e<i)break t}s=t.length;break n}if(!(e>=r)){let o=t[1];if(e<o)n=2,r=o;for(let a=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===a)break;if(i=r,r=t[--n-1],e>=r)break t}s=n,n=0;break n}break e}while(n<s){let o=n+s>>>1;if(e<t[o])s=o;else n=o+1}if(i=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i;for(let s=0;s!==i;++s)t[s]=n[r+s];return t}interpolate_(){throw Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}}class Pl extends oi{constructor(e,t,n,i){super(e,t,n,i);this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:2400,endingEnd:2400}}intervalChanged_(e,t,n){let i=this.parameterPositions,r=e-2,s=e+1,o=i[r],a=i[s];if(o===void 0)switch(this.getSettings_().endingStart){case 2401:r=e,o=2*t-n;break;case 2402:r=i.length-2,o=t+i[r]-i[r+1];break;default:r=e,o=n}if(a===void 0)switch(this.getSettings_().endingEnd){case 2401:s=e,a=2*n-t;break;case 2402:s=1,a=n+i[1]-i[0];break;default:s=e-1,a=t}let c=(n-t)*0.5,l=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(a-n),this._offsetPrev=r*l,this._offsetNext=s*l}interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=e*o,c=a-o,l=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,h=this._weightNext,f=(n-t)/(i-t),g=f*f,S=g*f,p=-d*S+2*d*g-d*f,m=(1+d)*S+(-1.5-2*d)*g+(-0.5+d)*f+1,T=(-1-h)*S+(1.5+h)*g+0.5*f,A=h*S-h*g;for(let v=0;v!==o;++v)r[v]=p*s[l+v]+m*s[c+v]+T*s[a+v]+A*s[u+v];return r}}class na extends oi{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=e*o,c=a-o,l=(n-t)/(i-t),u=1-l;for(let d=0;d!==o;++d)r[d]=s[c+d]*u+s[a+d]*l;return r}}class Ll extends oi{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}}class Nl extends oi{interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=e*o,c=a-o,l=this.inTangents,u=this.outTangents;if(!l||!u){let f=(n-t)/(i-t),g=1-f;for(let S=0;S!==o;++S)r[S]=s[c+S]*g+s[a+S]*f;return r}let d=o*2,h=e-1;for(let f=0;f!==o;++f){let g=s[c+f],S=s[a+f],p=h*d+f*2,m=u[p],T=u[p+1],A=e*d+f*2,v=l[A],w=l[A+1],E=Ox(n,t,m,v,i);r[f]=Jm(E,g,T,w,S)}return r}}function Jm(e,t,n,i,r){let s=1-e;return s*s*s*t+3*s*s*e*n+3*s*e*e*i+e*e*e*r}function Ux(e,t,n,i,r){let s=1-e;return 3*s*s*(n-t)+6*s*e*(i-n)+3*e*e*(r-i)}function Ox(e,t,n,i,r){let s=(e-t)/(r-t);for(let o=0;o<8;o++){let a=Jm(s,t,n,i,r)-e;if(Math.abs(a)<0.0000000001)break;let c=Ux(s,t,n,i,r);if(Math.abs(c)<0.0000000001)break;s=Math.max(0,Math.min(1,s-a/c))}return s}class cn{constructor(e,t,n,i){if(e===void 0)throw Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=yi(t,this.TimeBufferType),this.values=yi(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:yi(e.times,Array),values:yi(e.values,Array)};let i=e.getInterpolation();if(i!==e.DefaultInterpolation)n.interpolation=i;if(Po(e.settings))n.settings={inTangents:yi(e.settings.inTangents,Array),outTangents:yi(e.settings.outTangents,Array)}}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new Ll(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new na(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new Pl(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new Nl(this.times,this.values,this.getValueSize(),e);if(this.settings)t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents;return t}setInterpolation(e){let t;switch(e){case 2300:t=this.InterpolantFactoryMethodDiscrete;break;case 2301:t=this.InterpolantFactoryMethodLinear;break;case 2302:t=this.InterpolantFactoryMethodSmooth;break;case 2303:t=this.InterpolantFactoryMethodBezier;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(n);return Te("KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return 2300;case this.InterpolantFactoryMethodLinear:return 2301;case this.InterpolantFactoryMethodSmooth:return 2302;case this.InterpolantFactoryMethodBezier:return 2303}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e;if(Po(this.settings))Hp(this.settings.inTangents,e),Hp(this.settings.outTangents,e)}return this}trim(e,t){let n=this.times,i=n.length,r=0,s=i-1;while(r!==i&&n[r]<e)++r;while(s!==-1&&n[s]>t)--s;if(++s,r!==0||s!==i){if(r>=s)s=Math.max(s,1),r=s-1;let o=this.getValueSize();this.times=n.slice(r,s),this.values=this.values.slice(r*o,s*o)}return this}validate(){let e=!0,t=this.getValueSize();if(t-Math.floor(t)!==0)De("KeyframeTrack: Invalid value size in track.",this),e=!1;let n=this.times,i=this.values,r=n.length;if(r===0)De("KeyframeTrack: Track is empty.",this),e=!1;let s=null;for(let o=0;o!==r;o++){let a=n[o];if(typeof a==="number"&&isNaN(a)){De("KeyframeTrack: Time is not a valid number.",this,o,a),e=!1;break}if(s!==null&&s>a){De("KeyframeTrack: Out of order keys.",this,o,a,s),e=!1;break}s=a}if(i!==void 0){if(Z0(i))for(let o=0,a=i.length;o!==a;++o){let c=i[o];if(isNaN(c)){De("KeyframeTrack: Value is not a valid number.",this,o,c),e=!1;break}}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===2302,r=e.length-1,s=1;for(let o=1;o<r;++o){let a=!1,c=e[o],l=e[o+1];if(c!==l&&(o!==1||c!==e[0]))if(!i){let u=o*n,d=u-n,h=u+n;for(let f=0;f!==n;++f){let g=t[u+f];if(g!==t[d+f]||g!==t[h+f]){a=!0;break}}}else a=!0;if(a){if(o!==s){e[s]=e[o];let u=o*n,d=s*n;for(let h=0;h!==n;++h)t[d+h]=t[u+h]}++s}}if(r>0){e[s]=e[r];for(let o=r*n,a=s*n,c=0;c!==n;++c)t[a+c]=t[o+c];++s}if(s!==e.length)this.times=e.slice(0,s),this.values=t.slice(0,s*n);else this.times=e,this.values=t;return this}clone(){let e=this.times.slice(),t=this.values.slice(),i=new this.constructor(this.name,e,t);if(i.createInterpolant=this.createInterpolant,Po(this.settings))i.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()};return i}}function Hp(e,t){for(let n=0,i=e.length;n!==i;n+=2)e[n]*=t}cn.prototype.ValueTypeName="";cn.prototype.TimeBufferType=Float32Array;cn.prototype.ValueBufferType=Float32Array;cn.prototype.DefaultInterpolation=2301;class Ai extends cn{constructor(e,t,n){super(e,t,n)}}Ai.prototype.ValueTypeName="bool";Ai.prototype.ValueBufferType=Array;Ai.prototype.DefaultInterpolation=2300;Ai.prototype.InterpolantFactoryMethodLinear=void 0;Ai.prototype.InterpolantFactoryMethodSmooth=void 0;class ia extends cn{constructor(e,t,n,i){super(e,t,n,i)}}ia.prototype.ValueTypeName="color";class Ri extends cn{constructor(e,t,n,i){super(e,t,n,i)}}Ri.prototype.ValueTypeName="number";class Dl extends oi{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=(n-t)/(i-t),c=e*o;for(let l=c+o;c!==l;c+=4)Gt.slerpFlat(r,0,s,c-o,s,c,a);return r}}class An extends cn{constructor(e,t,n,i){super(e,t,n,i)}InterpolantFactoryMethodLinear(e){return new Dl(this.times,this.values,this.getValueSize(),e)}}An.prototype.ValueTypeName="quaternion";An.prototype.InterpolantFactoryMethodSmooth=void 0;class Ci extends cn{constructor(e,t,n){super(e,t,n)}}Ci.prototype.ValueTypeName="string";Ci.prototype.ValueBufferType=Array;Ci.prototype.DefaultInterpolation=2300;Ci.prototype.InterpolantFactoryMethodLinear=void 0;Ci.prototype.InterpolantFactoryMethodSmooth=void 0;class Hn extends cn{constructor(e,t,n,i){super(e,t,n,i)}}Hn.prototype.ValueTypeName="vector";class ri{constructor(e="",t=-1,n=[],i=2500){if(this.name=e,this.tracks=n,this.duration=t,this.blendMode=i,this.uuid=Mn(),this.userData={},this.duration<0)this.resetDuration()}static parse(e){let t=[],n=e.tracks,i=1/(e.fps||1);for(let s=0,o=n.length;s!==o;++s)t.push(zx(n[s]).scale(i));let r=new this(e.name,e.duration,t,e.blendMode);return r.uuid=e.uuid,r.userData=JSON.parse(e.userData||"{}"),r}static toJSON(e){let t=[],n=e.tracks,i={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode,userData:JSON.stringify(e.userData)};for(let r=0,s=n.length;r!==s;++r)t.push(cn.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(e,t,n,i){let r=t.length,s=[];for(let o=0;o<r;o++){let a=[],c=[];a.push((o+r-1)%r,o,(o+1)%r),c.push(0,1,0);let l=Nx(a);if(a=Gp(a,1,l),c=Gp(c,1,l),!i&&a[0]===0)a.push(r),c.push(c[0]);s.push(new Ri(".morphTargetInfluences["+t[o].name+"]",a,c).scale(1/n))}return new this(e,-1,s)}static findByName(e,t){let n=e;if(!Array.isArray(e)){let i=e;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===t)return n[i];return null}static CreateClipsFromMorphTargetSequences(e,t,n){let i={},r=/^([\w-]*?)([\d]+)$/;for(let o=0,a=e.length;o<a;o++){let c=e[o],l=c.name.match(r);if(l&&l.length>1){let u=l[1],d=i[u];if(!d)i[u]=d=[];d.push(c)}}let s=[];for(let o in i)s.push(this.CreateFromMorphTargetSequence(o,i[o],t,n));return s}resetDuration(){let e=this.tracks,t=0;for(let n=0,i=e.length;n!==i;++n){let r=this.tracks[n];t=Math.max(t,r.times[r.times.length-1])}return this.duration=t,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){let e=[];for(let n=0;n<this.tracks.length;n++)e.push(this.tracks[n].clone());let t=new this.constructor(this.name,this.duration,e,this.blendMode);return t.userData=JSON.parse(JSON.stringify(this.userData)),t}toJSON(){return this.constructor.toJSON(this)}}function Fx(e){switch(e.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return Ri;case"vector":case"vector2":case"vector3":case"vector4":return Hn;case"color":return ia;case"quaternion":return An;case"bool":case"boolean":return Ai;case"string":return Ci}throw Error("THREE.KeyframeTrack: Unsupported typeName: "+e)}function zx(e){if(e.type===void 0)throw Error("THREE.KeyframeTrack: track type undefined, can not parse");let t=Fx(e.type);if(e.times===void 0){let i=[],r=[];Dx(e.keys,i,r,"value"),e.times=i,e.values=r}let n;if(t.parse!==void 0)n=t.parse(e);else n=new t(e.name,e.times,e.values,e.interpolation);if(Po(e.settings))n.settings={inTangents:yi(e.settings.inTangents,Float32Array),outTangents:yi(e.settings.outTangents,Float32Array)};return n}var Nn={enabled:!1,files:{},add:function(e,t){if(this.enabled===!1)return;if(Vp(e))return;this.files[e]=t},get:function(e){if(this.enabled===!1)return;if(Vp(e))return;return this.files[e]},remove:function(e){delete this.files[e]},clear:function(){this.files={}}};function Vp(e){try{let t=e.slice(e.indexOf(":")+1);return new URL(t).protocol==="blob:"}catch(t){return!1}}class As{constructor(e,t,n){let i=this,r=!1,s=0,o=0,a=void 0,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this._abortController=null,this.itemStart=function(l){if(o++,r===!1){if(i.onStart!==void 0)i.onStart(l,s,o)}r=!0},this.itemEnd=function(l){if(s++,i.onProgress!==void 0)i.onProgress(l,s,o);if(s===o){if(r=!1,i.onLoad!==void 0)i.onLoad()}},this.itemError=function(l){if(i.onError!==void 0)i.onError(l)},this.resolveURL=function(l){if(l=l.normalize("NFC"),a)return a(l);return l},this.setURLModifier=function(l){return a=l,this},this.addHandler=function(l,u){return c.push(l,u),this},this.removeHandler=function(l){let u=c.indexOf(l);if(u!==-1)c.splice(u,2);return this},this.getHandler=function(l){for(let u=0,d=c.length;u<d;u+=2){let h=c[u],f=c[u+1];if(h.global)h.lastIndex=0;if(h.test(l))return f}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){if(!this._abortController)this._abortController=new AbortController;return this._abortController}}var Km=new As;class ai{constructor(e){if(this.manager=e!==void 0?e:Km,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(e,t){let n=this;return new Promise(function(i,r){n.load(e,i,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}}ai.DEFAULT_MATERIAL_NAME="__DEFAULT";var ti={};class jm extends Error{constructor(e,t){super(e);this.response=t}}class Rs extends ai{constructor(e){super(e);this.mimeType="",this.responseType="",this._abortController=new AbortController}load(e,t,n,i){if(e===void 0)e="";if(this.path!==void 0)e=this.path+e;e=this.manager.resolveURL(e);let r=Nn.get(`file:${e}`);if(r!==void 0){this.manager.itemStart(e),setTimeout(()=>{if(t)t(r);this.manager.itemEnd(e)},0);return}if(ti[e]!==void 0){ti[e].push({onLoad:t,onProgress:n,onError:i});return}ti[e]=[],ti[e].push({onLoad:t,onProgress:n,onError:i});let s=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any==="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,a=this.responseType;fetch(s).then((c)=>{if(c.status===200||c.status===0){if(c.status===0)Te("FileLoader: HTTP Status 0 received.");if(typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;let l=ti[e],u=c.body.getReader(),d=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),h=d?parseInt(d):0,f=h!==0,g=0,S=new ReadableStream({start(p){m();function m(){u.read().then(({done:T,value:A})=>{if(T)p.close();else{g+=A.byteLength;let v=new ProgressEvent("progress",{lengthComputable:f,loaded:g,total:h});for(let w=0,E=l.length;w<E;w++){let R=l[w];if(R.onProgress)R.onProgress(v)}p.enqueue(A),m()}},(T)=>{p.error(T)})}}});return new Response(S)}else throw new jm(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then((c)=>{switch(a){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then((l)=>new DOMParser().parseFromString(l,o));case"json":return c.json();default:if(o==="")return c.text();else{let u=/charset="?([^;"\s]*)"?/i.exec(o),d=u&&u[1]?u[1].toLowerCase():void 0,h=new TextDecoder(d);return c.arrayBuffer().then((f)=>h.decode(f))}}}).then((c)=>{Nn.add(`file:${e}`,c);let l=ti[e];delete ti[e];for(let u=0,d=l.length;u<d;u++){let h=l[u];if(h.onLoad)h.onLoad(c)}}).catch((c)=>{let l=ti[e];if(l===void 0)throw this.manager.itemError(e),c;delete ti[e];for(let u=0,d=l.length;u<d;u++){let h=l[u];if(h.onError)h.onError(c)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}var yr=new WeakMap;class Ul extends ai{constructor(e){super(e)}load(e,t,n,i){if(this.path!==void 0)e=this.path+e;e=this.manager.resolveURL(e);let r=this,s=Nn.get(`image:${e}`);if(s!==void 0){if(s.complete===!0)r.manager.itemStart(e),setTimeout(function(){if(t)t(s);r.manager.itemEnd(e)},0);else{let u=yr.get(s);if(u===void 0)u=[],yr.set(s,u);u.push({onLoad:t,onError:i})}return s}let o=wr("img");function a(){if(l(),t)t(this);let u=yr.get(this)||[];for(let d=0;d<u.length;d++){let h=u[d];if(h.onLoad)h.onLoad(this)}yr.delete(this),r.manager.itemEnd(e)}function c(u){if(l(),i)i(u);Nn.remove(`image:${e}`);let d=yr.get(this)||[];for(let h=0;h<d.length;h++){let f=d[h];if(f.onError)f.onError(u)}yr.delete(this),r.manager.itemError(e),r.manager.itemEnd(e)}function l(){o.removeEventListener("load",a,!1),o.removeEventListener("error",c,!1)}if(o.addEventListener("load",a,!1),o.addEventListener("error",c,!1),e.slice(0,5)!=="data:"){if(this.crossOrigin!==void 0)o.crossOrigin=this.crossOrigin}return Nn.add(`image:${e}`,o),r.manager.itemStart(e),o.src=e,o}}class ra extends ai{constructor(e){super(e)}load(e,t,n,i){let r=new St,s=new Ul(this.manager);return s.setCrossOrigin(this.crossOrigin),s.setPath(this.path),s.load(e,function(o){if(r.image=o,r.needsUpdate=!0,t!==void 0)t(r)},n,i),r}}class Or extends dt{constructor(e,t=1){super();this.isLight=!0,this.type="Light",this.color=new Ie(e),this.intensity=t}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}}class sa extends Or{constructor(e,t,n){super(e,n);this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(dt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Ie(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}}var xc=new Oe,Wp=new O,$p=new O;class Cs{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new ze(512,512),this.mapType=1009,this.map=null,this.mapPass=null,this.matrix=new Oe,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Ss,this._frameExtents=new ze(1,1),this._viewportCount=1,this._viewports=[new ot(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera;Wp.setFromMatrixPosition(e.matrixWorld),t.position.copy(Wp),$p.setFromMatrixPosition(e.target.matrixWorld),t.lookAt($p),t.updateMatrixWorld(),this._updateMatrix(t,this.matrix,this._frustum)}_updateMatrix(e,t,n,i){xc.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),n.setFromProjectionMatrix(xc,e.coordinateSystem,e.reversedDepth);let r=this._frameExtents,s=i?i.z/r.x:1,o=i?i.w/r.y:1,a=i?i.x/r.x:0,c=i?i.y/r.y:0;if(e.coordinateSystem===2001||e.reversedDepth)t.set(0.5*s,0,0,0.5*s+a,0,0.5*o,0,0.5*o+c,0,0,1,0,0,0,0,1);else t.set(0.5*s,0,0,0.5*s+a,0,0.5*o,0,0.5*o+c,0,0,0.5,0.5,0,0,0,1);t.multiply(xc)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){if(this.map)this.map.dispose();if(this.mapPass)this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return e.intensity=this.intensity,e.bias=this.bias,e.normalBias=this.normalBias,e.radius=this.radius,e.blurSamples=this.blurSamples,e.mapSize=this.mapSize.toArray(),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}var Co=new O,Io=new Gt,Ln=new O;class oa extends dt{constructor(){super();this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Oe,this.projectionMatrix=new Oe,this.projectionMatrixInverse=new Oe,this.coordinateSystem=2000,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){if(super.updateMatrixWorld(e),this.matrixWorld.decompose(Co,Io,Ln),Ln.x===1&&Ln.y===1&&Ln.z===1)this.matrixWorldInverse.copy(this.matrixWorld).invert();else this.matrixWorldInverse.compose(Co,Io,Ln.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){if(super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(Co,Io,Ln),Ln.x===1&&Ln.y===1&&Ln.z===1)this.matrixWorldInverse.copy(this.matrixWorld).invert();else this.matrixWorldInverse.compose(Co,Io,Ln.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}var vi=new O,Zp=new ze,Xp=new ze;class Lt extends oa{constructor(e=50,t=1,n=0.1,i=2000){super();this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=0.5*this.getFilmHeight()/e;this.fov=Vi*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(os*0.5*this.fov);return 0.5*this.getFilmHeight()/e}getEffectiveFOV(){return Vi*2*Math.atan(Math.tan(os*0.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){vi.set(-1,-1,0.5).applyMatrix4(this.projectionMatrixInverse),t.set(vi.x,vi.y).multiplyScalar(-e/vi.z),vi.set(1,1,0.5).applyMatrix4(this.projectionMatrixInverse),n.set(vi.x,vi.y).multiplyScalar(-e/vi.z)}getViewSize(e,t){return this.getViewBounds(e,Zp,Xp),t.subVectors(Xp,Zp)}setViewOffset(e,t,n,i,r,s){if(this.aspect=e/t,this.view===null)this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1};this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=s,this.updateProjectionMatrix()}clearViewOffset(){if(this.view!==null)this.view.enabled=!1;this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(os*0.5*this.fov)/this.zoom,n=2*t,i=this.aspect*n,r=-0.5*i,s=this.view;if(this.view!==null&&this.view.enabled){let{fullWidth:a,fullHeight:c}=s;r+=s.offsetX*i/a,t-=s.offsetY*n/c,i*=s.width/a,n*=s.height/c}let o=this.filmOffset;if(o!==0)r+=e*o/this.getFilmWidth();this.projectionMatrix.makePerspective(r,r+i,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);if(t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null)t.object.view=Object.assign({},this.view);return t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class Qm extends Cs{constructor(){super(new Lt(50,1,0.5,500));this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){let t=this.camera,n=Vi*2*e.angle*this.focus,i=this.mapSize.width/this.mapSize.height*this.aspect,r=e.distance||t.far;if(n!==t.fov||i!==t.aspect||r!==t.far)t.fov=n,t.aspect=i,t.far=r,t.updateProjectionMatrix();super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this.aspect=e.aspect,this}toJSON(){let e=super.toJSON();return e.focus=this.focus,e.aspect=this.aspect,e}}class aa extends Or{constructor(e,t,n=0,i=Math.PI/3,r=0,s=2){super(e,t);this.isSpotLight=!0,this.type="SpotLight",this.position.copy(dt.DEFAULT_UP),this.updateMatrix(),this.target=new dt,this.distance=n,this.angle=i,this.penumbra=r,this.decay=s,this.map=null,this.shadow=new Qm}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.map=e.map,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);if(t.object.distance=this.distance,t.object.angle=this.angle,t.object.decay=this.decay,t.object.penumbra=this.penumbra,t.object.target=this.target.uuid,this.map&&this.map.isTexture)t.object.map=this.map.toJSON(e).uuid;return t.object.shadow=this.shadow.toJSON(),t}}class eg extends Cs{constructor(){super(new Lt(90,1,0.5,500));this.isPointLightShadow=!0}}class ca extends Or{constructor(e,t,n=0,i=2){super(e,t);this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new eg}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}}class er extends oa{constructor(e=-1,t=1,n=1,i=-1,r=0.1,s=2000){super();this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=r,this.far=s,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,r,s){if(this.view===null)this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1};this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=s,this.updateProjectionMatrix()}clearViewOffset(){if(this.view!==null)this.view.enabled=!1;this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-e,s=n+e,o=i+t,a=i-t;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,l=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,s=r+c*this.view.width,o-=l*this.view.offsetY,a=o-l*this.view.height}this.projectionMatrix.makeOrthographic(r,s,o,a,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);if(t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null)t.object.view=Object.assign({},this.view);return t}}class tg extends Cs{constructor(){super(new er(-5,5,5,-5,0.5,500));this.isDirectionalLightShadow=!0}}class Fr extends Or{constructor(e,t){super(e,t);this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(dt.DEFAULT_UP),this.updateMatrix(),this.target=new dt,this.shadow=new tg}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}}class Ii{static extractUrlBase(e){let t=e.lastIndexOf("/");if(t===-1)return"./";return e.slice(0,t+1)}static resolveURL(e,t){if(typeof e!=="string"||e==="")return"";if(/^https?:\/\//i.test(t)&&/^\//.test(e))t=t.replace(/(^https?:\/\/[^\/]+).*/i,"$1");if(/^(https?:)?\/\//i.test(e))return e;if(/^data:.*,.*$/i.test(e))return e;if(/^blob:.*$/i.test(e))return e;return t+e}}var vc=new WeakMap;class la extends ai{constructor(e){super(e);if(this.isImageBitmapLoader=!0,typeof createImageBitmap>"u")Te("ImageBitmapLoader: createImageBitmap() not supported.");if(typeof fetch>"u")Te("ImageBitmapLoader: fetch() not supported.");this.options={premultiplyAlpha:"none"},this._abortController=new AbortController}setOptions(e){return this.options=e,this}load(e,t,n,i){if(e===void 0)e="";if(this.path!==void 0)e=this.path+e;e=this.manager.resolveURL(e);let r=this,s=Nn.get(`image-bitmap:${e}`);if(s!==void 0){if(r.manager.itemStart(e),s.then){s.then((c)=>{if(vc.has(s)===!0){if(i)i(vc.get(s));r.manager.itemError(e),r.manager.itemEnd(e)}else{if(t)t(c);r.manager.itemEnd(e)}});return}setTimeout(function(){if(t)t(s);r.manager.itemEnd(e)},0);return}let o={};o.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",o.headers=this.requestHeader,o.signal=typeof AbortSignal.any==="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;let a=fetch(e,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign({},r.options,{colorSpaceConversion:"none"}))}).then(function(c){if(Nn.add(`image-bitmap:${e}`,c),t)t(c);return r.manager.itemEnd(e),c}).catch(function(c){if(i)i(c);vc.set(a,c),Nn.remove(`image-bitmap:${e}`),r.manager.itemError(e),r.manager.itemEnd(e)});Nn.add(`image-bitmap:${e}`,a),r.manager.itemStart(e)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}var Sr=-90,br=1;class Ol extends dt{constructor(e,t,n){super();this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new Lt(Sr,br,e,t);i.layers=this.layers,this.add(i);let r=new Lt(Sr,br,e,t);r.layers=this.layers,this.add(r);let s=new Lt(Sr,br,e,t);s.layers=this.layers,this.add(s);let o=new Lt(Sr,br,e,t);o.layers=this.layers,this.add(o);let a=new Lt(Sr,br,e,t);a.layers=this.layers,this.add(a);let c=new Lt(Sr,br,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,i,r,s,o,a]=t;for(let c of t)this.remove(c);if(e===2000)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),s.up.set(0,0,1),s.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),a.up.set(0,1,0),a.lookAt(0,0,-1);else if(e===2001)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),s.up.set(0,0,-1),s.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),a.up.set(0,-1,0),a.lookAt(0,0,-1);else throw Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let c of t)this.add(c),c.updateMatrixWorld()}update(e,t){if(this.parent===null)this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;if(this.coordinateSystem!==e.coordinateSystem)this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem();let[r,s,o,a,c,l]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),h=e.getActiveMipmapLevel(),f=e.xr.enabled;e.xr.enabled=!1;let g=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let S=!1;if(e.isWebGLRenderer===!0)S=e.state.buffers.depth.getReversed();else S=e.reversedDepthBuffer;if(e.setRenderTarget(n,0,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,r),e.setRenderTarget(n,1,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,s),e.setRenderTarget(n,2,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,o),e.setRenderTarget(n,3,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,a),e.setRenderTarget(n,4,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,c),n.texture.generateMipmaps=g,e.setRenderTarget(n,5,i),S&&e.autoClear===!1)e.clearDepth();e.render(t,l),e.setRenderTarget(u,d,h),e.xr.enabled=f,n.texture.needsPMREMUpdate=!0}}class Fl extends Lt{constructor(e=[]){super();this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}class zl{constructor(e,t,n){this.binding=e,this.valueSize=n;let i,r,s;switch(t){case"quaternion":i=this._slerp,r=this._slerpAdditive,s=this._setAdditiveIdentityQuaternion,this.buffer=new Float64Array(n*6),this._workIndex=5;break;case"string":case"bool":i=this._select,r=this._select,s=this._setAdditiveIdentityOther,this.buffer=Array(n*5);break;default:i=this._lerp,r=this._lerpAdditive,s=this._setAdditiveIdentityNumeric,this.buffer=new Float64Array(n*5)}this._mixBufferRegion=i,this._mixBufferRegionAdditive=r,this._setIdentity=s,this._origIndex=3,this._addIndex=4,this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,this.useCount=0,this.referenceCount=0}accumulate(e,t){let n=this.buffer,i=this.valueSize,r=e*i+i,s=this.cumulativeWeight;if(s===0){for(let o=0;o!==i;++o)n[r+o]=n[o];s=t}else{s+=t;let o=t/s;this._mixBufferRegion(n,r,0,o,i)}this.cumulativeWeight=s}accumulateAdditive(e){let t=this.buffer,n=this.valueSize,i=n*this._addIndex;if(this.cumulativeWeightAdditive===0)this._setIdentity();this._mixBufferRegionAdditive(t,i,0,e,n),this.cumulativeWeightAdditive+=e}apply(e){let t=this.valueSize,n=this.buffer,i=e*t+t,r=this.cumulativeWeight,s=this.cumulativeWeightAdditive,o=this.binding;if(this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,r<1){let a=t*this._origIndex;this._mixBufferRegion(n,i,a,1-r,t)}if(s>0)this._mixBufferRegionAdditive(n,i,this._addIndex*t,1,t);for(let a=t,c=t+t;a!==c;++a)if(n[a]!==n[a+t]){o.setValue(n,i);break}}saveOriginalState(){let e=this.binding,t=this.buffer,n=this.valueSize,i=n*this._origIndex;e.getValue(t,i);for(let r=n,s=i;r!==s;++r)t[r]=t[i+r%n];this._setIdentity(),this.cumulativeWeight=0,this.cumulativeWeightAdditive=0}restoreOriginalState(){let e=this.valueSize*3;this.binding.setValue(this.buffer,e)}_setAdditiveIdentityNumeric(){let e=this._addIndex*this.valueSize,t=e+this.valueSize;for(let n=e;n<t;n++)this.buffer[n]=0}_setAdditiveIdentityQuaternion(){this._setAdditiveIdentityNumeric(),this.buffer[this._addIndex*this.valueSize+3]=1}_setAdditiveIdentityOther(){let e=this._origIndex*this.valueSize,t=this._addIndex*this.valueSize;for(let n=0;n<this.valueSize;n++)this.buffer[t+n]=this.buffer[e+n]}_select(e,t,n,i,r){if(i>=0.5)for(let s=0;s!==r;++s)e[t+s]=e[n+s]}_slerp(e,t,n,i){Gt.slerpFlat(e,t,e,t,e,n,i)}_slerpAdditive(e,t,n,i,r){let s=this._workIndex*r;Gt.multiplyQuaternionsFlat(e,s,e,t,e,n),Gt.slerpFlat(e,t,e,t,e,s,i)}_lerp(e,t,n,i,r){let s=1-i;for(let o=0;o!==r;++o){let a=t+o;e[a]=e[a]*s+e[n+o]*i}}_lerpAdditive(e,t,n,i,r){for(let s=0;s!==r;++s){let o=t+s;e[o]=e[o]+e[n+s]*i}}}var kl="\\[\\]\\.:\\/",kx=new RegExp("["+kl+"]","g"),Bl="[^"+kl+"]",Bx="[^"+kl.replace("\\.","")+"]",Gx=/((?:WC+[\/:])*)/.source.replace("WC",Bl),Hx=/(WCOD+)?/.source.replace("WCOD",Bx),Vx=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Bl),Wx=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Bl),$x=new RegExp("^"+Gx+Hx+Vx+Wx+"$"),Zx=["material","materials","bones","map"];class ng{constructor(e,t,n){let i=n||Qe.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,i)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];if(i!==void 0)i.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}}class Qe{constructor(e,t,n){this.path=t,this.parsedPath=n||Qe.parseTrackName(t),this.node=Qe.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){if(!(e&&e.isAnimationObjectGroup))return new Qe(e,t,n);else return new Qe.Composite(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(kx,"")}static parseTrackName(e){let t=$x.exec(e);if(t===null)throw Error("THREE.PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);if(Zx.indexOf(r)!==-1)n.nodeName=n.nodeName.substring(0,i),n.objectName=r}if(n.propertyName===null||n.propertyName.length===0)throw Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let s=0;s<r.length;s++){let o=r[s];if(o.name===t||o.uuid===t)return o;let a=n(o.children);if(a)return a}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,{objectName:n,propertyName:i,propertyIndex:r}=t;if(!e)e=Qe.findNode(this.rootNode,t.nodeName),this.node=e;if(this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){Te("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=t.objectIndex;switch(n){case"materials":if(!e.material){De("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){De("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){De("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let l=0;l<e.length;l++)if(e[l].name===c){c=l;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){De("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){De("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){De("PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(c!==void 0){if(e[c]===void 0){De("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[c]}}let s=e[i];if(s===void 0){let c=t.nodeName;De("PropertyBinding: Trying to update property for track: "+c+"."+i+" but it wasn't found.",e);return}let o=this.Versioning.None;if(this.targetObject=e,e.isMaterial===!0)o=this.Versioning.NeedsUpdate;else if(e.isObject3D===!0)o=this.Versioning.MatrixWorldNeedsUpdate;let a=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry){De("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){De("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}if(e.morphTargetDictionary[r]!==void 0)r=e.morphTargetDictionary[r]}a=this.BindingType.ArrayElement,this.resolvedProperty=s,this.propertyIndex=r}else if(s.fromArray!==void 0&&s.toArray!==void 0)a=this.BindingType.HasFromToArray,this.resolvedProperty=s;else if(Array.isArray(s))a=this.BindingType.EntireArray,this.resolvedProperty=s;else this.propertyName=i;this.getValue=this.GetterByBindingType[a],this.setValue=this.SetterByBindingTypeAndVersioning[a][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}}Qe.Composite=ng;Qe.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};Qe.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};Qe.prototype.GetterByBindingType=[Qe.prototype._getValue_direct,Qe.prototype._getValue_array,Qe.prototype._getValue_arrayElement,Qe.prototype._getValue_toArray];Qe.prototype.SetterByBindingTypeAndVersioning=[[Qe.prototype._setValue_direct,Qe.prototype._setValue_direct_setNeedsUpdate,Qe.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Qe.prototype._setValue_array,Qe.prototype._setValue_array_setNeedsUpdate,Qe.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Qe.prototype._setValue_arrayElement,Qe.prototype._setValue_arrayElement_setNeedsUpdate,Qe.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Qe.prototype._setValue_fromArray,Qe.prototype._setValue_fromArray_setNeedsUpdate,Qe.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];class Gl{constructor(e,t,n=null,i=t.blendMode){this._mixer=e,this._clip=t,this._localRoot=n,this.blendMode=i;let r=t.tracks,s=r.length,o=Array(s),a={endingStart:2400,endingEnd:2400};for(let c=0;c!==s;++c){let l=r[c].createInterpolant(null);o[c]=l,l.settings=a}this._interpolantSettings=a,this._interpolants=o,this._propertyBindings=Array(s),this._cacheIndex=null,this._byClipCacheIndex=null,this._timeScaleInterpolant=null,this._restoreTimeScale=null,this._weightInterpolant=null,this.loop=2201,this._loopCount=-1,this._startTime=null,this.time=0,this.timeScale=1,this._effectiveTimeScale=1,this.weight=1,this._effectiveWeight=1,this.repetitions=1/0,this.paused=!1,this.enabled=!0,this.clampWhenFinished=!1,this.zeroSlopeAtStart=!0,this.zeroSlopeAtEnd=!0}play(){return this._mixer._activateAction(this),this}stop(){return this._mixer._deactivateAction(this),this.reset()}reset(){return this.paused=!1,this.enabled=!0,this.time=0,this._loopCount=-1,this._startTime=null,this.stopFading().stopWarping()}isRunning(){return this.enabled&&!this.paused&&this.timeScale!==0&&this._startTime===null&&this._mixer._isActiveAction(this)}isScheduled(){return this._mixer._isActiveAction(this)}startAt(e){return this._startTime=e,this}setLoop(e,t){return this.loop=e,this.repetitions=t,this}setEffectiveWeight(e){return this.weight=e,this._effectiveWeight=this.enabled?e:0,this.stopFading()}getEffectiveWeight(){return this._effectiveWeight}fadeIn(e){return this._scheduleFading(e,0,1)}fadeOut(e){return this._scheduleFading(e,1,0)}crossFadeFrom(e,t,n=!1){if(e.fadeOut(t),this.fadeIn(t),n===!0){let i=this._clip.duration,r=e._clip.duration,s=r/i,o=i/r;e._restoreTimeScale=e.timeScale,this._restoreTimeScale=this.timeScale,e.warp(1,s,t),this.warp(o,1,t)}return this}crossFadeTo(e,t,n=!1){return e.crossFadeFrom(this,t,n)}stopFading(){let e=this._weightInterpolant;if(e!==null)this._weightInterpolant=null,this._mixer._takeBackControlInterpolant(e);return this}setEffectiveTimeScale(e){return this.timeScale=e,this._effectiveTimeScale=this.paused?0:e,this.stopWarping()}getEffectiveTimeScale(){return this._effectiveTimeScale}setDuration(e){return this.timeScale=this._clip.duration/e,this.stopWarping()}syncWith(e){return this.time=e.time,this.timeScale=e.timeScale,this.stopWarping()}halt(e){return this.warp(this._effectiveTimeScale,0,e)}warp(e,t,n){let i=this._mixer,r=i.time,s=this.timeScale,o=this._timeScaleInterpolant;if(o===null)o=i._lendControlInterpolant(),this._timeScaleInterpolant=o;let a=o.parameterPositions,c=o.sampleValues;return a[0]=r,a[1]=r+n,c[0]=e/s,c[1]=t/s,this}stopWarping(){let e=this._timeScaleInterpolant;if(e!==null)this._timeScaleInterpolant=null,this._mixer._takeBackControlInterpolant(e);return this._restoreTimeScale=null,this}getMixer(){return this._mixer}getClip(){return this._clip}getRoot(){return this._localRoot||this._mixer._root}_update(e,t,n,i){if(!this.enabled){this._updateWeight(e);return}let r=this._startTime;if(r!==null){let a=(e-r)*n;if(a<0||n===0)t=0;else this._startTime=null,t=n*a}t*=this._updateTimeScale(e);let s=this._updateTime(t),o=this._updateWeight(e);if(o>0){let a=this._interpolants,c=this._propertyBindings;switch(this.blendMode){case 2501:for(let l=0,u=a.length;l!==u;++l)a[l].evaluate(s),c[l].accumulateAdditive(o);break;case 2500:default:for(let l=0,u=a.length;l!==u;++l)a[l].evaluate(s),c[l].accumulate(i,o)}}}_updateWeight(e){let t=0;if(this.enabled){t=this.weight;let n=this._weightInterpolant;if(n!==null){let i=n.evaluate(e)[0];if(t*=i,e>n.parameterPositions[1]){if(this.stopFading(),i===0)this.enabled=!1}}}return this._effectiveWeight=t,t}_updateTimeScale(e){let t=0;if(!this.paused){t=this.timeScale;let n=this._timeScaleInterpolant;if(n!==null){let i=n.evaluate(e)[0];if(t*=i,e>n.parameterPositions[1]){if(t===0)this.paused=!0;else{if(this._restoreTimeScale!==null)t=this._restoreTimeScale;this.timeScale=t}this.stopWarping()}}}return this._effectiveTimeScale=t,t}_updateTime(e){let t=this._clip.duration,n=this.loop,i=this.time+e,r=this._loopCount,s=n===2202;if(e===0){if(r===-1)return i;return s&&(r&1)===1?t-i:i}if(n===2200){if(r===-1)this._loopCount=0,this._setEndings(!0,!0,!1);e:{if(i>=t)i=t;else if(i<0)i=0;else{this.time=i;break e}if(this.clampWhenFinished)this.paused=!0;else this.enabled=!1;this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:e<0?-1:1})}}else{if(r===-1)if(e>=0)r=0,this._setEndings(!0,this.repetitions===0,s);else this._setEndings(this.repetitions===0,!0,s);if(i>=t||i<0){let o=Math.floor(i/t);i-=t*o,r+=Math.abs(o);let a=this.repetitions-r;if(a<=0){if(this.clampWhenFinished)this.paused=!0;else this.enabled=!1;i=e>0?t:0,this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:e>0?1:-1})}else{if(a===1){let c=e<0;this._setEndings(c,!c,s)}else this._setEndings(!1,!1,s);this._loopCount=r,this.time=i,this._mixer.dispatchEvent({type:"loop",action:this,loopDelta:o})}}else this._loopCount=r,this.time=i;if(s&&(r&1)===1)return t-i}return i}_setEndings(e,t,n){let i=this._interpolantSettings;if(n)i.endingStart=2401,i.endingEnd=2401;else{if(e)i.endingStart=this.zeroSlopeAtStart?2401:2400;else i.endingStart=2402;if(t)i.endingEnd=this.zeroSlopeAtEnd?2401:2400;else i.endingEnd=2402}}_scheduleFading(e,t,n){let i=this._mixer,r=i.time,s=this._weightInterpolant;if(s===null)s=i._lendControlInterpolant(),this._weightInterpolant=s;let o=s.parameterPositions,a=s.sampleValues;return o[0]=r,a[0]=t,o[1]=r+e,a[1]=n,this}}var Xx=new Float32Array(1);class ua extends zn{constructor(e){super();if(this._root=e,this._initMemoryManager(),this._accuIndex=0,this.time=0,this.timeScale=1,typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}_bindAction(e,t){let n=e._localRoot||this._root,i=e._clip.tracks,r=i.length,{_propertyBindings:s,_interpolants:o}=e,a=n.uuid,c=this._bindingsByRootAndName,l=c[a];if(l===void 0)l={},c[a]=l;for(let u=0;u!==r;++u){let d=i[u],h=d.name,f=l[h];if(f!==void 0)++f.referenceCount,s[u]=f;else{if(f=s[u],f!==void 0){if(f._cacheIndex===null)++f.referenceCount,this._addInactiveBinding(f,a,h);continue}let g=t&&t._propertyBindings[u].binding.parsedPath;f=new zl(Qe.create(n,h,g),d.ValueTypeName,d.getValueSize()),++f.referenceCount,this._addInactiveBinding(f,a,h),s[u]=f}o[u].resultBuffer=f.buffer}}_activateAction(e){if(!this._isActiveAction(e)){if(e._cacheIndex===null){let n=(e._localRoot||this._root).uuid,i=e._clip.uuid,r=this._actionsByClip[i];this._bindAction(e,r&&r.knownActions[0]),this._addInactiveAction(e,i,n)}let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];if(r.useCount++===0)this._lendBinding(r),r.saveOriginalState()}this._lendAction(e)}}_deactivateAction(e){if(this._isActiveAction(e)){let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];if(--r.useCount===0)r.restoreOriginalState(),this._takeBackBinding(r)}this._takeBackAction(e)}}_initMemoryManager(){this._actions=[],this._nActiveActions=0,this._actionsByClip={},this._bindings=[],this._nActiveBindings=0,this._bindingsByRootAndName={},this._controlInterpolants=[],this._nActiveControlInterpolants=0;let e=this;this.stats={actions:{get total(){return e._actions.length},get inUse(){return e._nActiveActions}},bindings:{get total(){return e._bindings.length},get inUse(){return e._nActiveBindings}},controlInterpolants:{get total(){return e._controlInterpolants.length},get inUse(){return e._nActiveControlInterpolants}}}}_isActiveAction(e){let t=e._cacheIndex;return t!==null&&t<this._nActiveActions}_addInactiveAction(e,t,n){let i=this._actions,r=this._actionsByClip,s=r[t];if(s===void 0)s={knownActions:[e],actionByRoot:{}},e._byClipCacheIndex=0,r[t]=s;else{let o=s.knownActions;e._byClipCacheIndex=o.length,o.push(e)}e._cacheIndex=i.length,i.push(e),s.actionByRoot[n]=e}_removeInactiveAction(e){let t=this._actions,n=t[t.length-1],i=e._cacheIndex;n._cacheIndex=i,t[i]=n,t.pop(),e._cacheIndex=null;let r=e._clip.uuid,s=this._actionsByClip,o=s[r],a=o.knownActions,c=a[a.length-1],l=e._byClipCacheIndex;c._byClipCacheIndex=l,a[l]=c,a.pop(),e._byClipCacheIndex=null;let u=o.actionByRoot,d=(e._localRoot||this._root).uuid;if(delete u[d],a.length===0)delete s[r];this._removeInactiveBindingsForAction(e)}_removeInactiveBindingsForAction(e){let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];if(--r.referenceCount===0)this._removeInactiveBinding(r)}}_lendAction(e){let t=this._actions,n=e._cacheIndex,i=this._nActiveActions++,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_takeBackAction(e){let t=this._actions,n=e._cacheIndex,i=--this._nActiveActions,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_addInactiveBinding(e,t,n){let i=this._bindingsByRootAndName,r=this._bindings,s=i[t];if(s===void 0)s={},i[t]=s;s[n]=e,e._cacheIndex=r.length,r.push(e)}_removeInactiveBinding(e){let t=this._bindings,n=e.binding,i=n.rootNode.uuid,r=n.path,s=this._bindingsByRootAndName,o=s[i],a=t[t.length-1],c=e._cacheIndex;if(a._cacheIndex=c,t[c]=a,t.pop(),delete o[r],Object.keys(o).length===0)delete s[i]}_lendBinding(e){let t=this._bindings,n=e._cacheIndex,i=this._nActiveBindings++,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_takeBackBinding(e){let t=this._bindings,n=e._cacheIndex,i=--this._nActiveBindings,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_lendControlInterpolant(){let e=this._controlInterpolants,t=this._nActiveControlInterpolants++,n=e[t];if(n===void 0)n=new na(new Float32Array(2),new Float32Array(2),1,Xx),n.__cacheIndex=t,e[t]=n;return n}_takeBackControlInterpolant(e){let t=this._controlInterpolants,n=e.__cacheIndex,i=--this._nActiveControlInterpolants,r=t[i];e.__cacheIndex=i,t[i]=e,r.__cacheIndex=n,t[n]=r}clipAction(e,t,n){let i=t||this._root,r=i.uuid,s=typeof e==="string"?ri.findByName(i,e):e,o=s!==null?s.uuid:e,a=this._actionsByClip[o],c=null;if(n===void 0)if(s!==null)n=s.blendMode;else n=2500;if(a!==void 0){let u=a.actionByRoot[r];if(u!==void 0&&u.blendMode===n)return u;if(c=a.knownActions[0],s===null)s=c._clip}if(s===null)return null;let l=new Gl(this,s,t,n);return this._bindAction(l,c),this._addInactiveAction(l,o,r),l}existingAction(e,t){let n=t||this._root,i=n.uuid,r=typeof e==="string"?ri.findByName(n,e):e,s=r?r.uuid:e,o=this._actionsByClip[s];if(o!==void 0)return o.actionByRoot[i]||null;return null}stopAllAction(){let e=this._actions,t=this._nActiveActions;for(let n=t-1;n>=0;--n)e[n].stop();return this}update(e){e*=this.timeScale;let t=this._actions,n=this._nActiveActions,i=this.time+=e,r=Math.sign(e),s=this._accuIndex^=1;for(let c=0;c!==n;++c)t[c]._update(i,e,r,s);let o=this._bindings,a=this._nActiveBindings;for(let c=0;c!==a;++c)o[c].apply(s);return this}setTime(e){this.time=0;for(let t=0;t<this._actions.length;t++)this._actions[t].time=0;return this.update(e)}getRoot(){return this._root}uncacheClip(e){let t=this._actions,n=e.uuid,i=this._actionsByClip,r=i[n];if(r!==void 0){let s=r.knownActions;for(let o=0,a=s.length;o!==a;++o){let c=s[o];this._deactivateAction(c);let l=c._cacheIndex,u=t[t.length-1];c._cacheIndex=null,c._byClipCacheIndex=null,u._cacheIndex=l,t[l]=u,t.pop(),this._removeInactiveBindingsForAction(c)}delete i[n]}}uncacheRoot(e){let t=e.uuid,n=this._actionsByClip;for(let s in n){let o=n[s].actionByRoot,a=o[t];if(a!==void 0)this._deactivateAction(a),this._removeInactiveAction(a)}let i=this._bindingsByRootAndName,r=i[t];if(r!==void 0)for(let s in r){let o=r[s];o.restoreOriginalState(),this._removeInactiveBinding(o)}}uncacheAction(e,t){let n=this.existingAction(e,t);if(n!==null)this._deactivateAction(n),this._removeInactiveAction(n)}}var qp=new Oe;class ha{constructor(e,t,n=0,i=1/0){this.ray=new Ji(e,t),this.near=n,this.far=i,this.camera=null,this.layers=new ms,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){if(t.isPerspectiveCamera)this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,0.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t;else if(t.isOrthographicCamera)this.ray.origin.set(e.x,e.y,t.projectionMatrix.elements[14]).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t;else De("Raycaster: Unsupported camera type: "+t.type)}setFromXRController(e){return qp.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(qp),this}intersectObject(e,t=!0,n=[]){return Sc(e,this,n,t),n.sort(Yp),n}intersectObjects(e,t=!0,n=[]){for(let i=0,r=e.length;i<r;i++)Sc(e[i],this,n,t);return n.sort(Yp),n}}function Yp(e,t){return e.distance-t.distance}function Sc(e,t,n,i){let r=!0;if(e.layers.test(t.layers)){if(e.raycast(t,n)===!1)r=!1}if(r===!0&&i===!0){let s=e.children;for(let o=0,a=s.length;o<a;o++)Sc(s[o],t,n,!0)}}class Hl{static{Hl.prototype.isMatrix2=!0}constructor(e,t,n,i){if(this.elements=[1,0,0,1],e!==void 0)this.set(e,t,n,i)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,i){let r=this.elements;return r[0]=e,r[2]=t,r[1]=n,r[3]=i,this}}class da extends bs{constructor(e=10,t=10,n=4473924,i=8947848){n=new Ie(n),i=new Ie(i);let r=t/2,s=e/t,o=e/2,a=[],c=[];for(let d=0,h=0,f=-o;d<=t;d++,f+=s){a.push(-o,0,f,o,0,f),a.push(f,0,-o,f,0,o);let g=d===r?n:i;g.toArray(c,h),h+=3,g.toArray(c,h),h+=3,g.toArray(c,h),h+=3,g.toArray(c,h),h+=3}let l=new Tt;l.setAttribute("position",new bt(a,3)),l.setAttribute("color",new bt(c,3));let u=new Ti({vertexColors:!0,toneMapped:!1});super(l,u);this.type="GridHelper"}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}function Vl(e,t,n,i){let r=qx(i);switch(n){case 1021:return e*t;case 1028:return e*t/r.components*r.byteLength;case 1029:return e*t/r.components*r.byteLength;case 1030:return e*t*2/r.components*r.byteLength;case 1031:return e*t*2/r.components*r.byteLength;case 1022:return e*t*3/r.components*r.byteLength;case 1023:return e*t*4/r.components*r.byteLength;case 1033:return e*t*4/r.components*r.byteLength;case 33776:case 33777:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case 33778:case 33779:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 35841:case 35843:return Math.max(e,16)*Math.max(t,8)/4;case 35840:case 35842:return Math.max(e,8)*Math.max(t,8)/2;case 36196:case 37492:case 37488:case 37489:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case 37496:case 37490:case 37491:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 37808:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 37809:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case 37810:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case 37811:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case 37812:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case 37813:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case 37814:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case 37815:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case 37816:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case 37817:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case 37818:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case 37819:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case 37820:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case 37821:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case 36492:case 36494:case 36495:return Math.ceil(e/4)*Math.ceil(t/4)*16;case 36283:case 36284:return Math.ceil(e/4)*Math.ceil(t/4)*8;case 36285:case 36286:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw Error(`Unable to determine texture byte length for ${n} format.`)}function qx(e){switch(e){case 1009:case 1010:return{byteLength:1,components:1};case 1012:case 1011:case 1016:return{byteLength:2,components:1};case 1017:case 1018:return{byteLength:2,components:4};case 1014:case 1013:case 1015:return{byteLength:4,components:1};case 35902:case 35899:return{byteLength:4,components:3}}throw Error(`THREE.TextureUtils: Unknown texture type ${e}.`)}if(typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"186"}}));if(typeof window<"u")if(window.__THREE__)Te("WARNING: Multiple instances of Three.js being imported.");else window.__THREE__="186";function wg(){let e=null,t=!1,n=null,i=null;function r(s,o){i=e.requestAnimationFrame(r),n(s,o)}return{start:function(){if(t===!0)return;if(n===null)return;if(e===null)return;i=e.requestAnimationFrame(r),t=!0},stop:function(){if(e!==null)e.cancelAnimationFrame(i);t=!1},setAnimationLoop:function(s){n=s},setContext:function(s){e=s}}}function Yx(e){let t=new WeakMap;function n(a,c){let{array:l,usage:u}=a,d=l.byteLength,h=e.createBuffer();e.bindBuffer(c,h),e.bufferData(c,l,u),a.onUploadCallback();let f;if(l instanceof Float32Array)f=e.FLOAT;else if(typeof Float16Array<"u"&&l instanceof Float16Array)f=e.HALF_FLOAT;else if(l instanceof Uint16Array)if(a.isFloat16BufferAttribute)f=e.HALF_FLOAT;else f=e.UNSIGNED_SHORT;else if(l instanceof Int16Array)f=e.SHORT;else if(l instanceof Uint32Array)f=e.UNSIGNED_INT;else if(l instanceof Int32Array)f=e.INT;else if(l instanceof Int8Array)f=e.BYTE;else if(l instanceof Uint8Array)f=e.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)f=e.UNSIGNED_BYTE;else throw Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:h,type:f,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:d}}function i(a,c,l){let{array:u,updateRanges:d}=c;if(e.bindBuffer(l,a),d.length===0)e.bufferSubData(l,0,u);else{d.sort((f,g)=>f.start-g.start);let h=0;for(let f=1;f<d.length;f++){let g=d[h],S=d[f];if(S.start<=g.start+g.count+1)g.count=Math.max(g.count,S.start+S.count-g.start);else++h,d[h]=S}d.length=h+1;for(let f=0,g=d.length;f<g;f++){let S=d[f];e.bufferSubData(l,S.start*u.BYTES_PER_ELEMENT,u,S.start,S.count)}c.clearUpdateRanges()}c.onUploadCallback()}function r(a){if(a.isInterleavedBufferAttribute)a=a.data;return t.get(a)}function s(a){if(a.isInterleavedBufferAttribute)a=a.data;let c=t.get(a);if(c)e.deleteBuffer(c.buffer),t.delete(a)}function o(a,c){if(a.isInterleavedBufferAttribute)a=a.data;if(a.isGLBufferAttribute){let u=t.get(a);if(!u||u.version<a.version)t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let l=t.get(a);if(l===void 0)t.set(a,n(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(l.buffer,a,c),l.version=a.version}}return{get:r,remove:s,update:o}}var Jx=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Kx=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,jx=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Qx=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,ev=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,tv=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,nv=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,iv=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,rv=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,sv=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,ov=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,av=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,cv=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,lv=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,uv=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,hv=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,dv=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,fv=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,pv=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,mv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,gv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,_v=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,xv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,vv=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,yv=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Sv=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,bv=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Mv=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,wv=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Tv=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Ev="gl_FragColor = linearToOutputTexel( gl_FragColor );",Av=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Rv=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,Cv=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Iv=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Pv=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Lv=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Nv=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Dv=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Uv=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Ov=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Fv=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,zv=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,kv=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Bv=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Gv=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,Hv=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,Vv=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Wv=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,$v=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Zv=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Xv=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,qv=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Yv=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Jv=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Kv=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,jv=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,Qv=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,ey=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,ty=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,ny=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,iy=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,ry=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,sy=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,oy=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,ay=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,cy=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,ly=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,uy=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,hy=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,dy=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,fy=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,py=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,my=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,gy=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,_y=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,xy=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,vy=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,yy=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Sy=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,by=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,My=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,wy=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Ty=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,Ey=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Ay=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Ry=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Cy=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Iy=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Py=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Ly=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,Ny=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Dy=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Uy=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Oy=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Fy=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,zy=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,ky=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,By=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Gy=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Hy=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Vy=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,Wy=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,$y=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,Zy=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Xy=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,qy=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`;var Yy=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,Jy=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Ky=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,jy=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Qy=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,eS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,tS=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,nS=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,iS=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,rS=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,sS=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,oS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,aS=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cS=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,lS=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,uS=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,hS=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,dS=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,fS=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,pS=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,mS=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,gS=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,_S=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,xS=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,vS=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,yS=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,SS=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,bS=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,MS=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,wS=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,TS=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,ES=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,AS=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,RS=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,CS=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ge={alphahash_fragment:Jx,alphahash_pars_fragment:Kx,alphamap_fragment:jx,alphamap_pars_fragment:Qx,alphatest_fragment:ev,alphatest_pars_fragment:tv,aomap_fragment:nv,aomap_pars_fragment:iv,batching_pars_vertex:rv,batching_vertex:sv,begin_vertex:ov,beginnormal_vertex:av,bsdfs:cv,iridescence_fragment:lv,bumpmap_pars_fragment:uv,clipping_planes_fragment:hv,clipping_planes_pars_fragment:dv,clipping_planes_pars_vertex:fv,clipping_planes_vertex:pv,color_fragment:mv,color_pars_fragment:gv,color_pars_vertex:_v,color_vertex:xv,common:vv,cube_uv_reflection_fragment:yv,defaultnormal_vertex:Sv,displacementmap_pars_vertex:bv,displacementmap_vertex:Mv,emissivemap_fragment:wv,emissivemap_pars_fragment:Tv,colorspace_fragment:Ev,colorspace_pars_fragment:Av,envmap_fragment:Rv,envmap_common_pars_fragment:Cv,envmap_pars_fragment:Iv,envmap_pars_vertex:Pv,envmap_physical_pars_fragment:Hv,envmap_vertex:Lv,fog_vertex:Nv,fog_pars_vertex:Dv,fog_fragment:Uv,fog_pars_fragment:Ov,gradientmap_pars_fragment:Fv,lightmap_pars_fragment:zv,lights_lambert_fragment:kv,lights_lambert_pars_fragment:Bv,lights_pars_begin:Gv,lights_toon_fragment:Vv,lights_toon_pars_fragment:Wv,lights_phong_fragment:$v,lights_phong_pars_fragment:Zv,lights_physical_fragment:Xv,lights_physical_pars_fragment:qv,lights_fragment_begin:Yv,lights_fragment_maps:Jv,lights_fragment_end:Kv,lightprobes_pars_fragment:jv,logdepthbuf_fragment:Qv,logdepthbuf_pars_fragment:ey,logdepthbuf_pars_vertex:ty,logdepthbuf_vertex:ny,map_fragment:iy,map_pars_fragment:ry,map_particle_fragment:sy,map_particle_pars_fragment:oy,metalnessmap_fragment:ay,metalnessmap_pars_fragment:cy,morphinstance_vertex:ly,morphcolor_vertex:uy,morphnormal_vertex:hy,morphtarget_pars_vertex:dy,morphtarget_vertex:fy,normal_fragment_begin:py,normal_fragment_maps:my,normal_pars_fragment:gy,normal_pars_vertex:_y,normal_vertex:xy,normalmap_pars_fragment:vy,clearcoat_normal_fragment_begin:yy,clearcoat_normal_fragment_maps:Sy,clearcoat_pars_fragment:by,iridescence_pars_fragment:My,opaque_fragment:wy,packing:Ty,premultiplied_alpha_fragment:Ey,project_vertex:Ay,dithering_fragment:Ry,dithering_pars_fragment:Cy,roughnessmap_fragment:Iy,roughnessmap_pars_fragment:Py,shadowmap_pars_fragment:Ly,shadowmap_pars_vertex:Ny,shadowmap_vertex:Dy,shadowmask_pars_fragment:Uy,skinbase_vertex:Oy,skinning_pars_vertex:Fy,skinning_vertex:zy,skinnormal_vertex:ky,specularmap_fragment:By,specularmap_pars_fragment:Gy,tonemapping_fragment:Hy,tonemapping_pars_fragment:Vy,transmission_fragment:Wy,transmission_pars_fragment:$y,uv_pars_fragment:Zy,uv_pars_vertex:Xy,uv_vertex:qy,worldpos_vertex:Yy,background_vert:Jy,background_frag:Ky,backgroundCube_vert:jy,backgroundCube_frag:Qy,cube_vert:eS,cube_frag:tS,depth_vert:nS,depth_frag:iS,distance_vert:rS,distance_frag:sS,equirect_vert:oS,equirect_frag:aS,linedashed_vert:cS,linedashed_frag:lS,meshbasic_vert:uS,meshbasic_frag:hS,meshlambert_vert:dS,meshlambert_frag:fS,meshmatcap_vert:pS,meshmatcap_frag:mS,meshnormal_vert:gS,meshnormal_frag:_S,meshphong_vert:xS,meshphong_frag:vS,meshphysical_vert:yS,meshphysical_frag:SS,meshtoon_vert:bS,meshtoon_frag:MS,points_vert:wS,points_frag:TS,shadow_vert:ES,shadow_frag:AS,sprite_vert:RS,sprite_frag:CS},de={common:{diffuse:{value:new Ie(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ue},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ue}},envmap:{envMap:{value:null},envMapRotation:{value:new Ue},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:0.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ue}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ue}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ue},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ue},normalScale:{value:new ze(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ue},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ue}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ue}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ue}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:0.00025},fogNear:{value:1},fogFar:{value:2000},fogColor:{value:new Ie(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new O},probesMax:{value:new O},probesResolution:{value:new O}},points:{diffuse:{value:new Ie(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0},uvTransform:{value:new Ue}},sprite:{diffuse:{value:new Ie(16777215)},opacity:{value:1},center:{value:new ze(0.5,0.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ue},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0}}},Wn={basic:{uniforms:$t([de.common,de.specularmap,de.envmap,de.aomap,de.lightmap,de.fog]),vertexShader:Ge.meshbasic_vert,fragmentShader:Ge.meshbasic_frag},lambert:{uniforms:$t([de.common,de.specularmap,de.envmap,de.aomap,de.lightmap,de.emissivemap,de.bumpmap,de.normalmap,de.displacementmap,de.fog,de.lights,{emissive:{value:new Ie(0)},envMapIntensity:{value:1}}]),vertexShader:Ge.meshlambert_vert,fragmentShader:Ge.meshlambert_frag},phong:{uniforms:$t([de.common,de.specularmap,de.envmap,de.aomap,de.lightmap,de.emissivemap,de.bumpmap,de.normalmap,de.displacementmap,de.fog,de.lights,{emissive:{value:new Ie(0)},specular:{value:new Ie(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ge.meshphong_vert,fragmentShader:Ge.meshphong_frag},standard:{uniforms:$t([de.common,de.envmap,de.aomap,de.lightmap,de.emissivemap,de.bumpmap,de.normalmap,de.displacementmap,de.roughnessmap,de.metalnessmap,de.fog,de.lights,{emissive:{value:new Ie(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ge.meshphysical_vert,fragmentShader:Ge.meshphysical_frag},toon:{uniforms:$t([de.common,de.aomap,de.lightmap,de.emissivemap,de.bumpmap,de.normalmap,de.displacementmap,de.gradientmap,de.fog,de.lights,{emissive:{value:new Ie(0)}}]),vertexShader:Ge.meshtoon_vert,fragmentShader:Ge.meshtoon_frag},matcap:{uniforms:$t([de.common,de.bumpmap,de.normalmap,de.displacementmap,de.fog,{matcap:{value:null}}]),vertexShader:Ge.meshmatcap_vert,fragmentShader:Ge.meshmatcap_frag},points:{uniforms:$t([de.points,de.fog]),vertexShader:Ge.points_vert,fragmentShader:Ge.points_frag},dashed:{uniforms:$t([de.common,de.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ge.linedashed_vert,fragmentShader:Ge.linedashed_frag},depth:{uniforms:$t([de.common,de.displacementmap]),vertexShader:Ge.depth_vert,fragmentShader:Ge.depth_frag},normal:{uniforms:$t([de.common,de.bumpmap,de.normalmap,de.displacementmap,{opacity:{value:1}}]),vertexShader:Ge.meshnormal_vert,fragmentShader:Ge.meshnormal_frag},sprite:{uniforms:$t([de.sprite,de.fog]),vertexShader:Ge.sprite_vert,fragmentShader:Ge.sprite_frag},background:{uniforms:{uvTransform:{value:new Ue},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ge.background_vert,fragmentShader:Ge.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ue}},vertexShader:Ge.backgroundCube_vert,fragmentShader:Ge.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ge.cube_vert,fragmentShader:Ge.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ge.equirect_vert,fragmentShader:Ge.equirect_frag},distance:{uniforms:$t([de.common,de.displacementmap,{referencePosition:{value:new O},nearDistance:{value:1},farDistance:{value:1000}}]),vertexShader:Ge.distance_vert,fragmentShader:Ge.distance_frag},shadow:{uniforms:$t([de.lights,de.fog,{color:{value:new Ie(0)},opacity:{value:1}}]),vertexShader:Ge.shadow_vert,fragmentShader:Ge.shadow_frag}};Wn.physical={uniforms:$t([Wn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ue},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ue},clearcoatNormalScale:{value:new ze(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ue},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ue},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ue},sheen:{value:0},sheenColor:{value:new Ie(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ue},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ue},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ue},transmissionSamplerSize:{value:new ze},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ue},attenuationDistance:{value:0},attenuationColor:{value:new Ie(0)},specularColor:{value:new Ie(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ue},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ue},anisotropyVector:{value:new ze},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ue}}]),vertexShader:Ge.meshphysical_vert,fragmentShader:Ge.meshphysical_frag};var fa={r:0,b:0,g:0},IS=new Oe,Tg=new Ue;Tg.set(-1,0,0,0,1,0,0,0,1);function PS(e,t,n,i,r,s){let o=new Ie(0),a=r===!0?0:1,c,l,u=null,d=0,h=null;function f(T){let A=T.isScene===!0?T.background:null;if(A&&A.isTexture){let v=T.backgroundBlurriness>0;A=t.get(A,v)}return A}function g(T){let A=!1,v=f(T);if(v===null)p(o,a);else if(v&&v.isColor)p(v,1),A=!0;let w=e.xr.getEnvironmentBlendMode();if(w==="additive")n.buffers.color.setClear(0,0,0,1,s);else if(w==="alpha-blend")n.buffers.color.setClear(0,0,0,0,s);if(e.autoClear||A)n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil)}function S(T,A){let v=f(A);if(v&&(v.isCubeTexture||v.mapping===hs)){if(l===void 0)l=new vt(new Ei(1,1,1),new _n({name:"BackgroundCubeMaterial",uniforms:Qi(Wn.backgroundCube.uniforms),vertexShader:Wn.backgroundCube.vertexShader,fragmentShader:Wn.backgroundCube.fragmentShader,side:jt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),l.geometry.deleteAttribute("uv"),l.onBeforeRender=function(w,E,R){this.matrixWorld.copyPosition(R.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(l);if(l.material.uniforms.envMap.value=v,l.material.uniforms.backgroundBlurriness.value=A.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=A.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(IS.makeRotationFromEuler(A.backgroundRotation)).transpose(),v.isCubeTexture&&v.isRenderTargetTexture===!1)l.material.uniforms.backgroundRotation.value.premultiply(Tg);if(l.material.toneMapped=He.getTransfer(v.colorSpace)!==lt,u!==v||d!==v.version||h!==e.toneMapping)l.material.needsUpdate=!0,u=v,d=v.version,h=e.toneMapping;l.layers.enableAll(),T.unshift(l,l.geometry,l.material,0,0,null)}else if(v&&v.isTexture){if(c===void 0)c=new vt(new ws(2,2),new _n({name:"BackgroundMaterial",uniforms:Qi(Wn.background.uniforms),vertexShader:Wn.background.vertexShader,fragmentShader:Wn.background.fragmentShader,side:bi,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(c);if(c.material.uniforms.t2D.value=v,c.material.uniforms.backgroundIntensity.value=A.backgroundIntensity,c.material.toneMapped=He.getTransfer(v.colorSpace)!==lt,v.matrixAutoUpdate===!0)v.updateMatrix();if(c.material.uniforms.uvTransform.value.copy(v.matrix),u!==v||d!==v.version||h!==e.toneMapping)c.material.needsUpdate=!0,u=v,d=v.version,h=e.toneMapping;c.layers.enableAll(),T.unshift(c,c.geometry,c.material,0,0,null)}}function p(T,A){T.getRGB(fa,Rl(e)),n.buffers.color.setClear(fa.r,fa.g,fa.b,A,s)}function m(){if(l!==void 0)l.geometry.dispose(),l.material.dispose(),l=void 0;if(c!==void 0)c.geometry.dispose(),c.material.dispose(),c=void 0}return{getClearColor:function(){return o},setClearColor:function(T,A=1){o.set(T),a=A,p(o,a)},getClearAlpha:function(){return a},setClearAlpha:function(T){a=T,p(o,a)},render:g,addToRenderList:S,dispose:m}}function LS(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),i={},r=h(null),s=r,o=!1;function a(U,z,N,C,F){let V=!1,G=d(U,C,N,z);if(s!==G)s=G,l(s.object);if(V=f(U,C,N,F),V)g(U,C,N,F);if(F!==null)t.update(F,e.ELEMENT_ARRAY_BUFFER);if(V||o){if(o=!1,v(U,z,N,C),F!==null)e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(F).buffer)}}function c(){return e.createVertexArray()}function l(U){return e.bindVertexArray(U)}function u(U){return e.deleteVertexArray(U)}function d(U,z,N,C){let F=C.wireframe===!0,V=i[z.id];if(V===void 0)V={},i[z.id]=V;let G=U.isInstancedMesh===!0?U.id:0,ie=V[G];if(ie===void 0)ie={},V[G]=ie;let X=ie[N.id];if(X===void 0)X={},ie[N.id]=X;let Q=X[F];if(Q===void 0)Q=h(c()),X[F]=Q;return Q}function h(U){let z=[],N=[],C=[];for(let F=0;F<n;F++)z[F]=0,N[F]=0,C[F]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:z,enabledAttributes:N,attributeDivisors:C,object:U,attributes:{},index:null}}function f(U,z,N,C){let F=s.attributes,V=z.attributes,G=0,ie=N.getAttributes();for(let X in ie)if(ie[X].location>=0){let ee=F[X],ve=V[X];if(ve===void 0){if(X==="instanceMatrix"&&U.instanceMatrix)ve=U.instanceMatrix;if(X==="instanceColor"&&U.instanceColor)ve=U.instanceColor}if(ee===void 0)return!0;if(ee.attribute!==ve)return!0;if(ve&&ee.data!==ve.data)return!0;G++}if(s.attributesNum!==G)return!0;if(s.index!==C)return!0;return!1}function g(U,z,N,C){let F={},V=z.attributes,G=0,ie=N.getAttributes();for(let X in ie)if(ie[X].location>=0){let ee=V[X];if(ee===void 0){if(X==="instanceMatrix"&&U.instanceMatrix)ee=U.instanceMatrix;if(X==="instanceColor"&&U.instanceColor)ee=U.instanceColor}let ve={};if(ve.attribute=ee,ee&&ee.data)ve.data=ee.data;F[X]=ve,G++}s.attributes=F,s.attributesNum=G,s.index=C}function S(){let U=s.newAttributes;for(let z=0,N=U.length;z<N;z++)U[z]=0}function p(U){m(U,0)}function m(U,z){let N=s.newAttributes,C=s.enabledAttributes,F=s.attributeDivisors;if(N[U]=1,C[U]===0)e.enableVertexAttribArray(U),C[U]=1;if(F[U]!==z)e.vertexAttribDivisor(U,z),F[U]=z}function T(){let U=s.newAttributes,z=s.enabledAttributes;for(let N=0,C=z.length;N<C;N++)if(z[N]!==U[N])e.disableVertexAttribArray(N),z[N]=0}function A(U,z,N,C,F,V,G){if(G===!0)e.vertexAttribIPointer(U,z,N,F,V);else e.vertexAttribPointer(U,z,N,C,F,V)}function v(U,z,N,C){S();let F=C.attributes,V=N.getAttributes(),G=z.defaultAttributeValues;for(let ie in V){let X=V[ie];if(X.location>=0){let Q=F[ie];if(Q===void 0){if(ie==="instanceMatrix"&&U.instanceMatrix)Q=U.instanceMatrix;if(ie==="instanceColor"&&U.instanceColor)Q=U.instanceColor}if(Q!==void 0){let ee=Q.normalized,ve=Q.itemSize,Ee=t.get(Q);if(Ee===void 0)continue;let{buffer:qe,type:ke,bytesPerElement:q}=Ee,re=ke===e.INT||ke===e.UNSIGNED_INT||Q.gpuType===Dc;if(Q.isInterleavedBufferAttribute){let se=Q.data,Pe=se.stride,Ne=Q.offset;if(se.isInstancedInterleavedBuffer){for(let Re=0;Re<X.locationSize;Re++)m(X.location+Re,se.meshPerAttribute);if(U.isInstancedMesh!==!0&&C._maxInstanceCount===void 0)C._maxInstanceCount=se.meshPerAttribute*se.count}else for(let Re=0;Re<X.locationSize;Re++)p(X.location+Re);e.bindBuffer(e.ARRAY_BUFFER,qe);for(let Re=0;Re<X.locationSize;Re++)A(X.location+Re,ve/X.locationSize,ke,ee,Pe*q,(Ne+ve/X.locationSize*Re)*q,re)}else{if(Q.isInstancedBufferAttribute){for(let se=0;se<X.locationSize;se++)m(X.location+se,Q.meshPerAttribute);if(U.isInstancedMesh!==!0&&C._maxInstanceCount===void 0)C._maxInstanceCount=Q.meshPerAttribute*Q.count}else for(let se=0;se<X.locationSize;se++)p(X.location+se);e.bindBuffer(e.ARRAY_BUFFER,qe);for(let se=0;se<X.locationSize;se++)A(X.location+se,ve/X.locationSize,ke,ee,ve*q,ve/X.locationSize*se*q,re)}}else if(G!==void 0){let ee=G[ie];if(ee!==void 0)switch(ee.length){case 2:e.vertexAttrib2fv(X.location,ee);break;case 3:e.vertexAttrib3fv(X.location,ee);break;case 4:e.vertexAttrib4fv(X.location,ee);break;default:e.vertexAttrib1fv(X.location,ee)}}}}T()}function w(){M();for(let U in i){let z=i[U];for(let N in z){let C=z[N];for(let F in C){let V=C[F];for(let G in V)u(V[G].object),delete V[G];delete C[F]}}delete i[U]}}function E(U){if(i[U.id]===void 0)return;let z=i[U.id];for(let N in z){let C=z[N];for(let F in C){let V=C[F];for(let G in V)u(V[G].object),delete V[G];delete C[F]}}delete i[U.id]}function R(U){for(let z in i){let N=i[z];for(let C in N){let F=N[C];if(F[U.id]===void 0)continue;let V=F[U.id];for(let G in V)u(V[G].object),delete V[G];delete F[U.id]}}}function x(U){for(let z in i){let N=i[z],C=U.isInstancedMesh===!0?U.id:0,F=N[C];if(F===void 0)continue;for(let V in F){let G=F[V];for(let ie in G)u(G[ie].object),delete G[ie];delete F[V]}if(delete N[C],Object.keys(N).length===0)delete i[z]}}function M(){if(H(),o=!0,s===r)return;s=r,l(s.object)}function H(){r.geometry=null,r.program=null,r.wireframe=!1}return{setup:a,reset:M,resetDefaultState:H,dispose:w,releaseStatesOfGeometry:E,releaseStatesOfObject:x,releaseStatesOfProgram:R,initAttributes:S,enableAttribute:p,disableUnusedAttributes:T}}function NS(e,t,n){let i;function r(c){i=c}function s(c,l){e.drawArrays(i,c,l),n.update(l,i,1)}function o(c,l,u){if(u===0)return;e.drawArraysInstanced(i,c,l,u),n.update(l,i,u)}function a(c,l,u){if(u===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,c,0,l,0,u);let h=0;for(let f=0;f<u;f++)h+=l[f];n.update(h,i,1)}this.setMode=r,this.render=s,this.renderInstances=o,this.renderMultiDraw=a}function DS(e,t,n,i){let r;function s(){if(r!==void 0)return r;if(t.has("EXT_texture_filter_anisotropic")===!0){let R=t.get("EXT_texture_filter_anisotropic");r=e.getParameter(R.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else r=0;return r}function o(R){if(R!==Fn&&i.convert(R)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT))return!1;return!0}function a(R){let x=R===On&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));if(R!==En&&R!==si&&!x&&i.convert(R)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE))return!1;return!0}function c(R){if(R==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";R="mediump"}if(R==="mediump"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0)return"mediump"}return"lowp"}let l=n.precision!==void 0?n.precision:"highp",u=c(l);if(u!==l)Te("WebGLRenderer:",l,"not supported, using",u,"instead."),l=u;let d=n.logarithmicDepthBuffer===!0,h=n.reversedDepthBuffer===!0&&t.has("EXT_clip_control");if(n.reversedDepthBuffer===!0&&h===!1)Te("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");let f=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),g=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),S=e.getParameter(e.MAX_TEXTURE_SIZE),p=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),m=e.getParameter(e.MAX_VERTEX_ATTRIBS),T=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),A=e.getParameter(e.MAX_VARYING_VECTORS),v=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),w=e.getParameter(e.MAX_SAMPLES),E=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:h,maxTextures:f,maxVertexTextures:g,maxTextureSize:S,maxCubemapSize:p,maxAttributes:m,maxVertexUniforms:T,maxVaryings:A,maxFragmentUniforms:v,maxSamples:w,samples:E}}function US(e){let t=this,n=null,i=0,r=!1,s=!1,o=new dn,a=new Ue,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(d,h){let f=d.length!==0||h||i!==0||r;return r=h,i=d.length,f},this.beginShadows=function(){s=!0,u(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(d,h){n=u(d,h,0)},this.setState=function(d,h,f){let{clippingPlanes:g,clipIntersection:S,clipShadows:p}=d,m=e.get(d);if(!r||g===null||g.length===0||s&&!p)if(s)u(null);else l();else{let T=s?0:i,A=T*4,v=m.clippingState||null;c.value=v,v=u(g,h,A,f);for(let w=0;w!==A;++w)v[w]=n[w];m.clippingState=v,this.numIntersection=S?this.numPlanes:0,this.numPlanes+=T}};function l(){if(c.value!==n)c.value=n,c.needsUpdate=i>0;t.numPlanes=i,t.numIntersection=0}function u(d,h,f,g){let S=d!==null?d.length:0,p=null;if(S!==0){if(p=c.value,g!==!0||p===null){let m=f+S*4,T=h.matrixWorldInverse;if(a.getNormalMatrix(T),p===null||p.length<m)p=new Float32Array(m);for(let A=0,v=f;A!==S;++A,v+=4)o.copy(d[A]).applyMatrix4(T,a),o.normal.toArray(p,v),p[v+3]=o.constant}c.value=p,c.needsUpdate=!0}return t.numPlanes=S,t.numIntersection=0,p}}var kr=4,OS=6,FS=20,zS=256,Is=new er,ig=new Ie,Wl=null,$l=0,Zl=0,Xl=!1,kS=new O,tr=new O;class Jl{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=0.1,i=100,r={}){let{size:s=256,position:o=kS}=r;Wl=this._renderer.getRenderTarget(),$l=this._renderer.getActiveCubeFace(),Zl=this._renderer.getActiveMipmapLevel(),Xl=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(s);let a=this._allocateTargets();if(a.depthBuffer=!0,this._sceneToCubeUV(e,n,i,a,o),t>0)this._blur(a,0,0,t);return this._applyPMREM(a),this._cleanup(a),a}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){if(this._cubemapMaterial===null)this._cubemapMaterial=og(),this._compileMaterial(this._cubemapMaterial)}compileEquirectangularShader(){if(this._equirectMaterial===null)this._equirectMaterial=sg(),this._compileMaterial(this._equirectMaterial)}dispose(){if(this._dispose(),this._cubemapMaterial!==null)this._cubemapMaterial.dispose();if(this._equirectMaterial!==null)this._equirectMaterial.dispose();if(this._backgroundBox!==null)this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){if(this._blurMaterial!==null)this._blurMaterial.dispose();if(this._ggxMaterial!==null)this._ggxMaterial.dispose();if(this._pingPongRenderTarget!==null)this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Wl,$l,Zl),this._renderer.xr.enabled=Xl,e.scissorTest=!1,zr(e,0,0,e.width,e.height)}_fromTexture(e,t){if(e.mapping===Rr||e.mapping===Wi)this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width);else this._setSize(e.image.width/4);Wl=this._renderer.getRenderTarget(),$l=this._renderer.getActiveCubeFace(),Zl=this._renderer.getActiveMipmapLevel(),Xl=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:zt,minFilter:zt,generateMipmaps:!1,type:On,format:Fn,colorSpace:nn,depthBuffer:!1},i=rg(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){if(this._pingPongRenderTarget!==null)this._dispose();this._pingPongRenderTarget=rg(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=BS(r)),this._blurMaterial=HS(r,e,t),this._ggxMaterial=GS(r,e,t)}return i}_compileMaterial(e){let t=new vt(new Tt,e);this._renderer.compile(t,Is)}_sceneToCubeUV(e,t,n,i,r){let a=new Lt(90,1,t,n),c=[1,-1,1,1,1,1],l=[1,1,1,-1,-1,-1],u=this._renderer,{autoClear:d,toneMapping:h}=u;if(u.getClearColor(ig),u.toneMapping=wn,u.autoClear=!1,u.state.buffers.depth.getReversed())u.setRenderTarget(i),u.clearDepth(),u.setRenderTarget(null);if(this._backgroundBox===null)this._backgroundBox=new vt(new Ei,new kn({name:"PMREM.Background",side:jt,depthWrite:!1,depthTest:!1}));let g=this._backgroundBox,S=g.material,p=!1,m=e.background;if(m){if(m.isColor)S.color.copy(m),e.background=null,p=!0}else S.color.copy(ig),p=!0;for(let T=0;T<6;T++){let A=T%3;if(A===0)a.up.set(0,c[T],0),a.position.set(r.x,r.y,r.z),a.lookAt(r.x+l[T],r.y,r.z);else if(A===1)a.up.set(0,0,c[T]),a.position.set(r.x,r.y,r.z),a.lookAt(r.x,r.y+l[T],r.z);else a.up.set(0,c[T],0),a.position.set(r.x,r.y,r.z),a.lookAt(r.x,r.y,r.z+l[T]);let v=this._cubeSize;if(zr(i,A*v,T>2?v:0,v,v),u.setRenderTarget(i),p)u.render(g,a);u.render(e,a)}u.toneMapping=h,u.autoClear=d,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,i=e.mapping===Rr||e.mapping===Wi;if(i){if(this._cubemapMaterial===null)this._cubemapMaterial=og();this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1}else if(this._equirectMaterial===null)this._equirectMaterial=sg();let r=i?this._cubemapMaterial:this._equirectMaterial,s=this._lodMeshes[0];s.material=r;let o=r.uniforms;o.envMap.value=e;let a=this._cubeSize;zr(t,0,0,3*a,2*a),n.setRenderTarget(t),n.render(s,Is)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let i=this._lodMeshes.length;for(let r=1;r<i;r++)this._applyGGXFilter(e,r-1,r);t.autoClear=n}_applyGGXFilter(e,t,n){let i=this._renderer,r=this._pingPongRenderTarget,s=this._ggxMaterial,o=this._lodMeshes[n];o.material=s;let a=s.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l),d=c*1.25,h=u*d,{_lodMax:f}=this,g=this._sizeLods[n],S=3*g*(n>f-kr?n-f+kr:0),p=4*(this._cubeSize-g);a.envMap.value=e.texture,a.roughness.value=h,a.mipInt.value=f-t,zr(r,S,p,3*g,2*g),i.setRenderTarget(r),i.render(o,Is),a.envMap.value=r.texture,a.roughness.value=0,a.mipInt.value=f-n,zr(e,S,p,3*g,2*g),i.setRenderTarget(e),i.render(o,Is)}_blur(e,t,n,i){let r=this._pingPongRenderTarget,s=Math.min(i,Math.PI)/Math.SQRT2;this._blurPass(e,r,t,n,s),this._blurPass(r,e,n,n,s)}_blurPass(e,t,n,i,r){let s=this._renderer,o=this._blurMaterial,a=this._lodMeshes[i];a.material=o;let c=o.uniforms;c.envMap.value=e.texture,c.sigma.value=r,c.mipInt.value=this._lodMax-n;let l=this._sizeLods[i],u=3*l*(i>this._lodMax-kr?i-this._lodMax+kr:0),d=4*(this._cubeSize-l);zr(t,u,d,3*l,2*l),s.setRenderTarget(t),s.render(a,Is)}}function BS(e){let t=[],n=[],i=e,r=e-kr+1+OS;for(let s=0;s<r;s++){let o=Math.pow(2,i);t.push(o);let a=1/(o-2),c=-a,l=1+a,u=[c,c,l,c,l,l,c,c,l,l,c,l],d=6,h=6,f=3,g=new Float32Array(f*h*d),S=new Float32Array(f*h*d);for(let m=0;m<d;m++){let T=m%3*2/3-1,A=m>2?0:-1,v=[T,A,0,T+0.6666666666666666,A,0,T+0.6666666666666666,A+1,0,T,A,0,T+0.6666666666666666,A+1,0,T,A+1,0];g.set(v,f*h*m);for(let w=0;w<h;w++){let E=u[w*2]*2-1,R=u[w*2+1]*2-1;if(m===0)tr.set(1,R,E);else if(m===1)tr.set(-E,1,-R);else if(m===2)tr.set(-E,R,1);else if(m===3)tr.set(-1,R,-E);else if(m===4)tr.set(-E,-1,R);else tr.set(E,R,-1);tr.toArray(S,(m*h+w)*f)}}let p=new Tt;if(p.setAttribute("position",new Ft(g,f)),p.setAttribute("outputDirection",new Ft(S,f)),n.push(new vt(p,null)),i>kr)i--}return{lodMeshes:n,sizeLods:t}}function rg(e,t,n){let i=new rn(e,t,n);return i.texture.mapping=hs,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function zr(e,t,n,i,r){e.viewport.set(t,n,i,r),e.scissor.set(t,n,i,r)}function GS(e,t,n){return new _n({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:zS,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:ma(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Dn,depthTest:!1,depthWrite:!1})}function HS(e,t,n){return new _n({name:"SphericalGaussianBlur",defines:{SAMPLES:FS,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:ma(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:Dn,depthTest:!1,depthWrite:!1})}function sg(){return new _n({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:ma(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Dn,depthTest:!1,depthWrite:!1})}function og(){return new _n({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:ma(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Dn,depthTest:!1,depthWrite:!1})}function ma(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}class Ql extends rn{constructor(e=1,t={}){super(e,e,t);this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},i=[n,n,n,n,n,n];this.texture=new ea(i),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new Ei(5,5,5),r=new _n({name:"CubemapFromEquirect",uniforms:Qi(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:jt,blending:Dn});r.uniforms.tEquirect.value=t;let s=new vt(i,r),o=t.minFilter;if(t.minFilter===Un)t.minFilter=zt;return new Ol(1,10,this).update(e,s),t.minFilter=o,s.geometry.dispose(),s.material.dispose(),this}clear(e,t=!0,n=!0,i=!0){let r=e.getRenderTarget();for(let s=0;s<6;s++)e.setRenderTarget(this,s),e.clear(t,n,i);e.setRenderTarget(r)}}function VS(e){let t=new WeakMap,n=new WeakMap,i=null;function r(h,f=!1){if(h===null||h===void 0)return null;if(f)return o(h);return s(h)}function s(h){if(h&&h.isTexture){let f=h.mapping;if(f===Do||f===Uo)if(t.has(h)){let g=t.get(h).texture;return a(g,h.mapping)}else{let g=h.image;if(g&&g.height>0){let S=new Ql(g.height);return S.fromEquirectangularTexture(e,h),t.set(h,S),h.addEventListener("dispose",l),a(S.texture,h.mapping)}else return null}}return h}function o(h){if(h&&h.isTexture){let f=h.mapping,g=f===Do||f===Uo,S=f===Rr||f===Wi;if(g||S){let p=n.get(h),m=p!==void 0?p.texture.pmremVersion:0;if(h.isRenderTargetTexture&&h.pmremVersion!==m){if(i===null)i=new Jl(e);return p=g?i.fromEquirectangular(h,p):i.fromCubemap(h,p),p.texture.pmremVersion=h.pmremVersion,n.set(h,p),p.texture}else if(p!==void 0)return p.texture;else{let T=h.image;if(g&&T&&T.height>0||S&&T&&c(T)){if(i===null)i=new Jl(e);return p=g?i.fromEquirectangular(h):i.fromCubemap(h),p.texture.pmremVersion=h.pmremVersion,n.set(h,p),h.addEventListener("dispose",u),p.texture}else return null}}}return h}function a(h,f){if(f===Do)h.mapping=Rr;else if(f===Uo)h.mapping=Wi;return h}function c(h){let f=0,g=6;for(let S=0;S<g;S++)if(h[S]!==void 0)f++;return f===g}function l(h){let f=h.target;f.removeEventListener("dispose",l);let g=t.get(f);if(g!==void 0)t.delete(f),g.dispose()}function u(h){let f=h.target;f.removeEventListener("dispose",u);let g=n.get(f);if(g!==void 0)n.delete(f),g.dispose()}function d(){if(t=new WeakMap,n=new WeakMap,i!==null)i.dispose(),i=null}return{get:r,dispose:d}}function WS(e){let t={};function n(i){if(t[i]!==void 0)return t[i];let r=e.getExtension(i);return t[i]=r,r}return{has:function(i){return n(i)!==null},init:function(){n("EXT_color_buffer_float"),n("WEBGL_clip_cull_distance"),n("OES_texture_float_linear"),n("EXT_color_buffer_half_float"),n("WEBGL_multisampled_render_to_texture"),n("WEBGL_render_shared_exponent")},get:function(i){let r=n(i);if(r===null)Hi("WebGLRenderer: "+i+" extension not supported.");return r}}}function $S(e,t,n,i){let r={},s=new WeakMap;function o(d){let h=d.target;if(h.index!==null)t.remove(h.index);for(let g in h.attributes)t.remove(h.attributes[g]);h.removeEventListener("dispose",o),delete r[h.id];let f=s.get(h);if(f)t.remove(f),s.delete(h);if(i.releaseStatesOfGeometry(h),h.isInstancedBufferGeometry===!0)delete h._maxInstanceCount;n.memory.geometries--}function a(d,h){if(r[h.id]===!0)return h;return h.addEventListener("dispose",o),r[h.id]=!0,n.memory.geometries++,h}function c(d){let h=d.attributes;for(let f in h)t.update(h[f],e.ARRAY_BUFFER)}function l(d){let h=[],f=d.index,g=d.attributes.position,S=0;if(g===void 0)return;if(f!==null){let T=f.array;S=f.version;for(let A=0,v=T.length;A<v;A+=3){let w=T[A+0],E=T[A+1],R=T[A+2];h.push(w,E,E,R,R,w)}}else{let T=g.array;S=g.version;for(let A=0,v=T.length/3-1;A<v;A+=3){let w=A+0,E=A+1,R=A+2;h.push(w,E,E,R,R,w)}}let p=new(g.count>=65535?Jo:Yo)(h,1);p.version=S;let m=s.get(d);if(m)t.remove(m);s.set(d,p)}function u(d){let h=s.get(d);if(h){let f=d.index;if(f!==null){if(h.version<f.version)l(d)}}else l(d);return s.get(d)}return{get:a,update:c,getWireframeAttribute:u}}function ZS(e,t,n){let i;function r(d){i=d}let s,o;function a(d){s=d.type,o=d.bytesPerElement}function c(d,h){e.drawElements(i,h,s,d*o),n.update(h,i,1)}function l(d,h,f){if(f===0)return;e.drawElementsInstanced(i,h,s,d*o,f),n.update(h,i,f)}function u(d,h,f){if(f===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,h,0,s,d,0,f);let S=0;for(let p=0;p<f;p++)S+=h[p];n.update(S,i,1)}this.setMode=r,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=u}function XS(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function i(s,o,a){switch(n.calls++,o){case e.TRIANGLES:n.triangles+=a*(s/3);break;case e.LINES:n.lines+=a*(s/2);break;case e.LINE_STRIP:n.lines+=a*(s-1);break;case e.LINE_LOOP:n.lines+=a*s;break;case e.POINTS:n.points+=a*s;break;default:De("WebGLInfo: Unknown draw mode:",o);break}}function r(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:r,update:i}}function qS(e,t,n){let i=new WeakMap,r=new ot;function s(o,a,c){let l=o.morphTargetInfluences,u=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,d=u!==void 0?u.length:0,h=i.get(a);if(h===void 0||h.count!==d){let M=function(){R.dispose(),i.delete(a),a.removeEventListener("dispose",M)};if(h!==void 0)h.texture.dispose();let f=a.morphAttributes.position!==void 0,g=a.morphAttributes.normal!==void 0,S=a.morphAttributes.color!==void 0,p=a.morphAttributes.position||[],m=a.morphAttributes.normal||[],T=a.morphAttributes.color||[],A=0;if(f===!0)A=1;if(g===!0)A=2;if(S===!0)A=3;let v=a.attributes.position.count*A,w=1;if(v>t.maxTextureSize)w=Math.ceil(v/t.maxTextureSize),v=t.maxTextureSize;let E=new Float32Array(v*w*4*d),R=new Xo(E,v,w,d);R.type=si,R.needsUpdate=!0;let x=A*4;for(let H=0;H<d;H++){let U=p[H],z=m[H],N=T[H],C=v*w*4*H;for(let F=0;F<U.count;F++){let V=F*x;if(f===!0)r.fromBufferAttribute(U,F),E[C+V+0]=r.x,E[C+V+1]=r.y,E[C+V+2]=r.z,E[C+V+3]=0;if(g===!0)r.fromBufferAttribute(z,F),E[C+V+4]=r.x,E[C+V+5]=r.y,E[C+V+6]=r.z,E[C+V+7]=0;if(S===!0)r.fromBufferAttribute(N,F),E[C+V+8]=r.x,E[C+V+9]=r.y,E[C+V+10]=r.z,E[C+V+11]=N.itemSize===4?r.w:1}}h={count:d,texture:R,size:new ze(v,w)},i.set(a,h),a.addEventListener("dispose",M)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)c.getUniforms().setValue(e,"morphTexture",o.morphTexture,n);else{let f=0;for(let S=0;S<l.length;S++)f+=l[S];let g=a.morphTargetsRelative?1:1-f;c.getUniforms().setValue(e,"morphTargetBaseInfluence",g),c.getUniforms().setValue(e,"morphTargetInfluences",l)}c.getUniforms().setValue(e,"morphTargetsTexture",h.texture,n),c.getUniforms().setValue(e,"morphTargetsTextureSize",h.size)}return{update:s}}function YS(e,t,n,i,r){let s=new WeakMap;function o(l){let u=r.render.frame,d=l.geometry,h=t.get(l,d);if(s.get(h)!==u)t.update(h),s.set(h,u);if(l.isInstancedMesh){if(l.hasEventListener("dispose",c)===!1)l.addEventListener("dispose",c);if(s.get(l)!==u){if(n.update(l.instanceMatrix,e.ARRAY_BUFFER),l.instanceColor!==null)n.update(l.instanceColor,e.ARRAY_BUFFER);s.set(l,u)}}if(l.isSkinnedMesh){let f=l.skeleton;if(s.get(f)!==u)f.update(),s.set(f,u)}return h}function a(){s=new WeakMap}function c(l){let u=l.target;if(u.removeEventListener("dispose",c),i.releaseStatesOfObject(u),n.remove(u.instanceMatrix),u.instanceColor!==null)n.remove(u.instanceColor)}return{update:o,dispose:a}}var JS={[Ac]:"LINEAR_TONE_MAPPING",[Rc]:"REINHARD_TONE_MAPPING",[Cc]:"CINEON_TONE_MAPPING",[Ic]:"ACES_FILMIC_TONE_MAPPING",[Lc]:"AGX_TONE_MAPPING",[Nc]:"NEUTRAL_TONE_MAPPING",[Pc]:"CUSTOM_TONE_MAPPING"};function KS(e,t,n,i,r,s){let o=new rn(t,n,{type:e,depthBuffer:r,stencilBuffer:s,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),a=null,c=null,l=new Tt;l.setAttribute("position",new bt([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new bt([0,2,0,0,2,0],2));let u=new Cl({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),d=new vt(l,u),h=new er(-1,1,1,-1,0,1),f=null,g=null,S=!1,p,m=null,T=[],A=!1;this.setSize=function(v,w){if(o.setSize(v,w),a!==null)a.setSize(v,w);if(c!==null)c.setSize(v,w);for(let E=0;E<T.length;E++){let R=T[E];if(R.setSize)R.setSize(v,w)}},this.setEffects=function(v){T=v,A=T.length>0&&T[0].isRenderPass===!0;let{width:w,height:E}=o;if(T.length>0&&a===null)a=new rn(w,E,{type:On,depthBuffer:!1,stencilBuffer:!1}),c=new rn(w,E,{type:On,depthBuffer:!1,stencilBuffer:!1});for(let R=0;R<T.length;R++){let x=T[R];if(x.setSize)x.setSize(w,E)}},this.begin=function(v,w){if(S)return!1;if(v.toneMapping===wn&&T.length===0)return!1;if(m=w,w!==null){let{width:E,height:R}=w;if(o.width!==E||o.height!==R)this.setSize(E,R)}if(A===!1)v.setRenderTarget(o);return p=v.toneMapping,v.toneMapping=wn,!0},this.hasRenderPass=function(){return A},this.end=function(v,w){v.toneMapping=p,S=!0;let E=o,R=a;for(let x=0;x<T.length;x++){let M=T[x];if(M.enabled===!1)continue;if(M.render(v,R,E,w),M.needsSwap!==!1)E=R,R=R===a?c:a}if(f!==v.outputColorSpace||g!==v.toneMapping){if(f=v.outputColorSpace,g=v.toneMapping,u.defines={},He.getTransfer(f)===lt)u.defines.SRGB_TRANSFER="";let x=JS[g];if(x)u.defines[x]="";u.needsUpdate=!0}u.uniforms.tDiffuse.value=E.texture,v.setRenderTarget(m),v.render(d,h),m=null,S=!1},this.isCompositing=function(){return S},this.dispose=function(){if(o.dispose(),a!==null)a.dispose();if(c!==null)c.dispose();l.dispose(),u.dispose()}}var Eg=new St,Kl=new Ki(1,1),Ag=new Xo,Rg=new El,Cg=new ea,ag=[],cg=[],lg=new Float32Array(16),ug=new Float32Array(9),hg=new Float32Array(4);function Br(e,t,n){let i=e[0];if(i<=0||i>0)return e;let r=t*n,s=ag[r];if(s===void 0)s=new Float32Array(r),ag[r]=s;if(t!==0){i.toArray(s,0);for(let o=1,a=0;o!==t;++o)a+=n,e[o].toArray(s,a)}return s}function Nt(e,t){if(e.length!==t.length)return!1;for(let n=0,i=e.length;n<i;n++)if(e[n]!==t[n])return!1;return!0}function Dt(e,t){for(let n=0,i=t.length;n<i;n++)e[n]=t[n]}function ga(e,t){let n=cg[t];if(n===void 0)n=new Int32Array(t),cg[t]=n;for(let i=0;i!==t;++i)n[i]=e.allocateTextureUnit();return n}function jS(e,t){let n=this.cache;if(n[0]===t)return;e.uniform1f(this.addr,t),n[0]=t}function QS(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y)e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y}else{if(Nt(n,t))return;e.uniform2fv(this.addr,t),Dt(n,t)}}function eb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z}else if(t.r!==void 0){if(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b}else{if(Nt(n,t))return;e.uniform3fv(this.addr,t),Dt(n,t)}}function tb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w}else{if(Nt(n,t))return;e.uniform4fv(this.addr,t),Dt(n,t)}}function nb(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Nt(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),Dt(n,t)}else{if(Nt(n,i))return;hg.set(i),e.uniformMatrix2fv(this.addr,!1,hg),Dt(n,i)}}function ib(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Nt(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),Dt(n,t)}else{if(Nt(n,i))return;ug.set(i),e.uniformMatrix3fv(this.addr,!1,ug),Dt(n,i)}}function rb(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Nt(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),Dt(n,t)}else{if(Nt(n,i))return;lg.set(i),e.uniformMatrix4fv(this.addr,!1,lg),Dt(n,i)}}function sb(e,t){let n=this.cache;if(n[0]===t)return;e.uniform1i(this.addr,t),n[0]=t}function ob(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y)e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y}else{if(Nt(n,t))return;e.uniform2iv(this.addr,t),Dt(n,t)}}function ab(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z}else{if(Nt(n,t))return;e.uniform3iv(this.addr,t),Dt(n,t)}}function cb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w}else{if(Nt(n,t))return;e.uniform4iv(this.addr,t),Dt(n,t)}}function lb(e,t){let n=this.cache;if(n[0]===t)return;e.uniform1ui(this.addr,t),n[0]=t}function ub(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y)e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y}else{if(Nt(n,t))return;e.uniform2uiv(this.addr,t),Dt(n,t)}}function hb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z}else{if(Nt(n,t))return;e.uniform3uiv(this.addr,t),Dt(n,t)}}function db(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w}else{if(Nt(n,t))return;e.uniform4uiv(this.addr,t),Dt(n,t)}}function fb(e,t,n){let i=this.cache,r=n.allocateTextureUnit();if(i[0]!==r)e.uniform1i(this.addr,r),i[0]=r;let s;if(this.type===e.SAMPLER_2D_SHADOW)Kl.compareFunction=n.isReversedDepthBuffer()?Zo:$o,s=Kl;else s=Eg;n.setTexture2D(t||s,r)}function pb(e,t,n){let i=this.cache,r=n.allocateTextureUnit();if(i[0]!==r)e.uniform1i(this.addr,r),i[0]=r;n.setTexture3D(t||Rg,r)}function mb(e,t,n){let i=this.cache,r=n.allocateTextureUnit();if(i[0]!==r)e.uniform1i(this.addr,r),i[0]=r;n.setTextureCube(t||Cg,r)}function gb(e,t,n){let i=this.cache,r=n.allocateTextureUnit();if(i[0]!==r)e.uniform1i(this.addr,r),i[0]=r;n.setTexture2DArray(t||Ag,r)}function _b(e){switch(e){case 5126:return jS;case 35664:return QS;case 35665:return eb;case 35666:return tb;case 35674:return nb;case 35675:return ib;case 35676:return rb;case 5124:case 35670:return sb;case 35667:case 35671:return ob;case 35668:case 35672:return ab;case 35669:case 35673:return cb;case 5125:return lb;case 36294:return ub;case 36295:return hb;case 36296:return db;case 35678:case 36198:case 36298:case 36306:case 35682:return fb;case 35679:case 36299:case 36307:return pb;case 35680:case 36300:case 36308:case 36293:return mb;case 36289:case 36303:case 36311:case 36292:return gb}}function xb(e,t){e.uniform1fv(this.addr,t)}function vb(e,t){let n=Br(t,this.size,2);e.uniform2fv(this.addr,n)}function yb(e,t){let n=Br(t,this.size,3);e.uniform3fv(this.addr,n)}function Sb(e,t){let n=Br(t,this.size,4);e.uniform4fv(this.addr,n)}function bb(e,t){let n=Br(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function Mb(e,t){let n=Br(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function wb(e,t){let n=Br(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function Tb(e,t){e.uniform1iv(this.addr,t)}function Eb(e,t){e.uniform2iv(this.addr,t)}function Ab(e,t){e.uniform3iv(this.addr,t)}function Rb(e,t){e.uniform4iv(this.addr,t)}function Cb(e,t){e.uniform1uiv(this.addr,t)}function Ib(e,t){e.uniform2uiv(this.addr,t)}function Pb(e,t){e.uniform3uiv(this.addr,t)}function Lb(e,t){e.uniform4uiv(this.addr,t)}function Nb(e,t,n){let i=this.cache,r=t.length,s=ga(n,r);if(!Nt(i,s))e.uniform1iv(this.addr,s),Dt(i,s);let o;if(this.type===e.SAMPLER_2D_SHADOW)o=Kl;else o=Eg;for(let a=0;a!==r;++a)n.setTexture2D(t[a]||o,s[a])}function Db(e,t,n){let i=this.cache,r=t.length,s=ga(n,r);if(!Nt(i,s))e.uniform1iv(this.addr,s),Dt(i,s);for(let o=0;o!==r;++o)n.setTexture3D(t[o]||Rg,s[o])}function Ub(e,t,n){let i=this.cache,r=t.length,s=ga(n,r);if(!Nt(i,s))e.uniform1iv(this.addr,s),Dt(i,s);for(let o=0;o!==r;++o)n.setTextureCube(t[o]||Cg,s[o])}function Ob(e,t,n){let i=this.cache,r=t.length,s=ga(n,r);if(!Nt(i,s))e.uniform1iv(this.addr,s),Dt(i,s);for(let o=0;o!==r;++o)n.setTexture2DArray(t[o]||Ag,s[o])}function Fb(e){switch(e){case 5126:return xb;case 35664:return vb;case 35665:return yb;case 35666:return Sb;case 35674:return bb;case 35675:return Mb;case 35676:return wb;case 5124:case 35670:return Tb;case 35667:case 35671:return Eb;case 35668:case 35672:return Ab;case 35669:case 35673:return Rb;case 5125:return Cb;case 36294:return Ib;case 36295:return Pb;case 36296:return Lb;case 35678:case 36198:case 36298:case 36306:case 35682:return Nb;case 35679:case 36299:case 36307:return Db;case 35680:case 36300:case 36308:case 36293:return Ub;case 36289:case 36303:case 36311:case 36292:return Ob}}class Ig{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=_b(t.type)}}class Pg{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Fb(t.type)}}class Lg{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let i=this.seq;for(let r=0,s=i.length;r!==s;++r){let o=i[r];o.setValue(e,t[o.id],n)}}}var ql=/(\w+)(\])?(\[|\.)?/g;function dg(e,t){e.seq.push(t),e.map[t.id]=t}function zb(e,t,n){let i=e.name,r=i.length;ql.lastIndex=0;while(!0){let s=ql.exec(i),o=ql.lastIndex,a=s[1],c=s[2]==="]",l=s[3];if(c)a=a|0;if(l===void 0||l==="["&&o+2===r){dg(n,l===void 0?new Ig(a,e,t):new Pg(a,e,t));break}else{let d=n.map[a];if(d===void 0)d=new Lg(a),dg(n,d);n=d}}}class Ns{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let s=0;s<n;++s){let o=e.getActiveUniform(t,s),a=e.getUniformLocation(t,o.name);zb(o,a,this)}let i=[],r=[];for(let s of this.seq)if(s.type===e.SAMPLER_2D_SHADOW||s.type===e.SAMPLER_CUBE_SHADOW||s.type===e.SAMPLER_2D_ARRAY_SHADOW)i.push(s);else r.push(s);if(i.length>0)this.seq=i.concat(r)}setValue(e,t,n,i){let r=this.map[t];if(r!==void 0)r.setValue(e,n,i)}setOptional(e,t,n){let i=t[n];if(i!==void 0)this.setValue(e,n,i)}static upload(e,t,n,i){for(let r=0,s=t.length;r!==s;++r){let o=t[r],a=n[o.id];if(a.needsUpdate!==!1)o.setValue(e,a.value,i)}}static seqWithValue(e,t){let n=[];for(let i=0,r=e.length;i!==r;++i){let s=e[i];if(s.id in t)n.push(s)}return n}}function fg(e,t,n){let i=e.createShader(t);return e.shaderSource(i,n),e.compileShader(i),i}var kb=37297,Bb=0;function Gb(e,t){let n=e.split(`
`),i=[],r=Math.max(t-6,0),s=Math.min(t+6,n.length);for(let o=r;o<s;o++){let a=o+1;i.push(`${a===t?">":" "} ${a}: ${n[o]}`)}return i.join(`
`)}var pg=new Ue;function Hb(e){He._getMatrix(pg,He.workingColorSpace,e);let t=`mat3( ${pg.elements.map((n)=>n.toFixed(4))} )`;switch(He.getTransfer(e)){case yl:return[t,"LinearTransferOETF"];case lt:return[t,"sRGBTransferOETF"];default:return Te("WebGLProgram: Unsupported color space: ",e),[t,"LinearTransferOETF"]}}function mg(e,t,n){let i=e.getShaderParameter(t,e.COMPILE_STATUS),s=(e.getShaderInfoLog(t)||"").trim();if(i&&s==="")return"";let o=/ERROR: 0:(\d+)/.exec(s);if(o){let a=parseInt(o[1]);return n.toUpperCase()+`

`+s+`

`+Gb(e.getShaderSource(t),a)}else return s}function Vb(e,t){let n=Hb(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,"}"].join(`
`)}var Wb={[Ac]:"Linear",[Rc]:"Reinhard",[Cc]:"Cineon",[Ic]:"ACESFilmic",[Lc]:"AgX",[Nc]:"Neutral",[Pc]:"Custom"};function $b(e,t){let n=Wb[t];if(n===void 0)return Te("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+e+"( vec3 color ) { return LinearToneMapping( color ); }";return"vec3 "+e+"( vec3 color ) { return "+n+"ToneMapping( color ); }"}var pa=new O;function Zb(){He.getLuminanceCoefficients(pa);let e=pa.x.toFixed(4),t=pa.y.toFixed(4),n=pa.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${e}, ${t}, ${n} );`,"\treturn dot( weights, rgb );","}"].join(`
`)}function Xb(e){return[e.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",e.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Ls).join(`
`)}function qb(e){let t=[];for(let n in e){let i=e[n];if(i===!1)continue;t.push("#define "+n+" "+i)}return t.join(`
`)}function Yb(e,t){let n={},i=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let r=0;r<i;r++){let s=e.getActiveAttrib(t,r),o=s.name,a=1;if(s.type===e.FLOAT_MAT2)a=2;if(s.type===e.FLOAT_MAT3)a=3;if(s.type===e.FLOAT_MAT4)a=4;n[o]={type:s.type,location:e.getAttribLocation(t,o),locationSize:a}}return n}function Ls(e){return e!==""}function gg(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function _g(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var Jb=/^[ \t]*#include +<([\w\d./]+)>/gm;function jl(e){return e.replace(Jb,jb)}var Kb=new Map;function jb(e,t){let n=Ge[t];if(n===void 0){let i=Kb.get(t);if(i!==void 0)n=Ge[i],Te('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,i);else throw Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return jl(n)}var Qb=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function xg(e){return e.replace(Qb,eM)}function eM(e,t,n,i){let r="";for(let s=parseInt(t);s<parseInt(n);s++)r+=i.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return r}function vg(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;if(e.precision==="highp")t+=`
#define HIGH_PRECISION`;else if(e.precision==="mediump")t+=`
#define MEDIUM_PRECISION`;else if(e.precision==="lowp")t+=`
#define LOW_PRECISION`;return t}var tM={[ls]:"SHADOWMAP_TYPE_PCF",[Er]:"SHADOWMAP_TYPE_VSM"};function nM(e){return tM[e.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var iM={[Rr]:"ENVMAP_TYPE_CUBE",[Wi]:"ENVMAP_TYPE_CUBE",[hs]:"ENVMAP_TYPE_CUBE_UV"};function rM(e){if(e.envMap===!1)return"ENVMAP_TYPE_CUBE";return iM[e.envMapMode]||"ENVMAP_TYPE_CUBE"}var sM={[Wi]:"ENVMAP_MODE_REFRACTION"};function oM(e){if(e.envMap===!1)return"ENVMAP_MODE_REFLECTION";return sM[e.envMapMode]||"ENVMAP_MODE_REFLECTION"}var aM={[Am]:"ENVMAP_BLENDING_MULTIPLY",[Rm]:"ENVMAP_BLENDING_MIX",[Cm]:"ENVMAP_BLENDING_ADD"};function cM(e){if(e.envMap===!1)return"ENVMAP_BLENDING_NONE";return aM[e.combine]||"ENVMAP_BLENDING_NONE"}function lM(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,i=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,n),112)),texelHeight:i,maxMip:n}}function uM(e,t,n,i){let r=e.getContext(),{defines:s,vertexShader:o,fragmentShader:a}=n,c=nM(n),l=rM(n),u=oM(n),d=cM(n),h=lM(n),f=Xb(n),g=qb(s),S=r.createProgram(),p,m,T=n.glslVersion?"#version "+n.glslVersion+`
`:"";if(n.isRawShaderMaterial){if(p=["#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g].filter(Ls).join(`
`),p.length>0)p+=`
`;if(m=["#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g].filter(Ls).join(`
`),m.length>0)m+=`
`}else p=[vg(n),"#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g,n.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",n.batching?"#define USE_BATCHING":"",n.batchingColor?"#define USE_BATCHING_COLOR":"",n.instancing?"#define USE_INSTANCING":"",n.instancingColor?"#define USE_INSTANCING_COLOR":"",n.instancingMorph?"#define USE_INSTANCING_MORPH":"",n.useFog&&n.fog?"#define USE_FOG":"",n.useFog&&n.fogExp2?"#define FOG_EXP2":"",n.map?"#define USE_MAP":"",n.envMap?"#define USE_ENVMAP":"",n.envMap?"#define "+u:"",n.lightMap?"#define USE_LIGHTMAP":"",n.aoMap?"#define USE_AOMAP":"",n.bumpMap?"#define USE_BUMPMAP":"",n.normalMap?"#define USE_NORMALMAP":"",n.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",n.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",n.displacementMap?"#define USE_DISPLACEMENTMAP":"",n.emissiveMap?"#define USE_EMISSIVEMAP":"",n.anisotropy?"#define USE_ANISOTROPY":"",n.anisotropyMap?"#define USE_ANISOTROPYMAP":"",n.clearcoatMap?"#define USE_CLEARCOATMAP":"",n.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",n.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",n.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",n.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",n.specularMap?"#define USE_SPECULARMAP":"",n.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",n.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",n.roughnessMap?"#define USE_ROUGHNESSMAP":"",n.metalnessMap?"#define USE_METALNESSMAP":"",n.alphaMap?"#define USE_ALPHAMAP":"",n.alphaHash?"#define USE_ALPHAHASH":"",n.transmission?"#define USE_TRANSMISSION":"",n.transmissionMap?"#define USE_TRANSMISSIONMAP":"",n.thicknessMap?"#define USE_THICKNESSMAP":"",n.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",n.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",n.mapUv?"#define MAP_UV "+n.mapUv:"",n.alphaMapUv?"#define ALPHAMAP_UV "+n.alphaMapUv:"",n.lightMapUv?"#define LIGHTMAP_UV "+n.lightMapUv:"",n.aoMapUv?"#define AOMAP_UV "+n.aoMapUv:"",n.emissiveMapUv?"#define EMISSIVEMAP_UV "+n.emissiveMapUv:"",n.bumpMapUv?"#define BUMPMAP_UV "+n.bumpMapUv:"",n.normalMapUv?"#define NORMALMAP_UV "+n.normalMapUv:"",n.displacementMapUv?"#define DISPLACEMENTMAP_UV "+n.displacementMapUv:"",n.metalnessMapUv?"#define METALNESSMAP_UV "+n.metalnessMapUv:"",n.roughnessMapUv?"#define ROUGHNESSMAP_UV "+n.roughnessMapUv:"",n.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+n.anisotropyMapUv:"",n.clearcoatMapUv?"#define CLEARCOATMAP_UV "+n.clearcoatMapUv:"",n.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+n.clearcoatNormalMapUv:"",n.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+n.clearcoatRoughnessMapUv:"",n.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+n.iridescenceMapUv:"",n.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+n.iridescenceThicknessMapUv:"",n.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+n.sheenColorMapUv:"",n.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+n.sheenRoughnessMapUv:"",n.specularMapUv?"#define SPECULARMAP_UV "+n.specularMapUv:"",n.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+n.specularColorMapUv:"",n.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+n.specularIntensityMapUv:"",n.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+n.transmissionMapUv:"",n.thicknessMapUv?"#define THICKNESSMAP_UV "+n.thicknessMapUv:"",n.vertexTangents&&n.flatShading===!1?"#define USE_TANGENT":"",n.vertexNormals?"#define HAS_NORMAL":"",n.vertexColors?"#define USE_COLOR":"",n.vertexAlphas?"#define USE_COLOR_ALPHA":"",n.vertexUv1s?"#define USE_UV1":"",n.vertexUv2s?"#define USE_UV2":"",n.vertexUv3s?"#define USE_UV3":"",n.pointsUvs?"#define USE_POINTS_UV":"",n.flatShading?"#define FLAT_SHADED":"",n.skinning?"#define USE_SKINNING":"",n.morphTargets?"#define USE_MORPHTARGETS":"",n.morphNormals&&n.flatShading===!1?"#define USE_MORPHNORMALS":"",n.morphColors?"#define USE_MORPHCOLORS":"",n.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+n.morphTextureStride:"",n.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+n.morphTargetsCount:"",n.doubleSided?"#define DOUBLE_SIDED":"",n.flipSided?"#define FLIP_SIDED":"",n.shadowMapEnabled?"#define USE_SHADOWMAP":"",n.shadowMapEnabled?"#define "+c:"",n.sizeAttenuation?"#define USE_SIZEATTENUATION":"",n.numLightProbes>0?"#define USE_LIGHT_PROBES":"",n.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",n.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","\tattribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","\tattribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","\tuniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","\tattribute vec2 uv1;","#endif","#ifdef USE_UV2","\tattribute vec2 uv2;","#endif","#ifdef USE_UV3","\tattribute vec2 uv3;","#endif","#ifdef USE_TANGENT","\tattribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","\tattribute vec4 color;","#elif defined( USE_COLOR )","\tattribute vec3 color;","#endif","#ifdef USE_SKINNING","\tattribute vec4 skinIndex;","\tattribute vec4 skinWeight;","#endif",`
`].filter(Ls).join(`
`),m=[vg(n),"#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g,n.useFog&&n.fog?"#define USE_FOG":"",n.useFog&&n.fogExp2?"#define FOG_EXP2":"",n.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",n.map?"#define USE_MAP":"",n.matcap?"#define USE_MATCAP":"",n.envMap?"#define USE_ENVMAP":"",n.envMap?"#define "+l:"",n.envMap?"#define "+u:"",n.envMap?"#define "+d:"",h?"#define CUBEUV_TEXEL_WIDTH "+h.texelWidth:"",h?"#define CUBEUV_TEXEL_HEIGHT "+h.texelHeight:"",h?"#define CUBEUV_MAX_MIP "+h.maxMip+".0":"",n.lightMap?"#define USE_LIGHTMAP":"",n.aoMap?"#define USE_AOMAP":"",n.bumpMap?"#define USE_BUMPMAP":"",n.normalMap?"#define USE_NORMALMAP":"",n.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",n.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",n.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",n.emissiveMap?"#define USE_EMISSIVEMAP":"",n.anisotropy?"#define USE_ANISOTROPY":"",n.anisotropyMap?"#define USE_ANISOTROPYMAP":"",n.clearcoat?"#define USE_CLEARCOAT":"",n.clearcoatMap?"#define USE_CLEARCOATMAP":"",n.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",n.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",n.dispersion?"#define USE_DISPERSION":"",n.retroreflection?"#define USE_RETROREFLECTION":"",n.iridescence?"#define USE_IRIDESCENCE":"",n.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",n.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",n.specularMap?"#define USE_SPECULARMAP":"",n.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",n.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",n.roughnessMap?"#define USE_ROUGHNESSMAP":"",n.metalnessMap?"#define USE_METALNESSMAP":"",n.alphaMap?"#define USE_ALPHAMAP":"",n.alphaTest?"#define USE_ALPHATEST":"",n.alphaHash?"#define USE_ALPHAHASH":"",n.sheen?"#define USE_SHEEN":"",n.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",n.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",n.transmission?"#define USE_TRANSMISSION":"",n.transmissionMap?"#define USE_TRANSMISSIONMAP":"",n.thicknessMap?"#define USE_THICKNESSMAP":"",n.vertexTangents&&n.flatShading===!1?"#define USE_TANGENT":"",n.vertexColors||n.instancingColor?"#define USE_COLOR":"",n.vertexAlphas||n.batchingColor?"#define USE_COLOR_ALPHA":"",n.vertexUv1s?"#define USE_UV1":"",n.vertexUv2s?"#define USE_UV2":"",n.vertexUv3s?"#define USE_UV3":"",n.pointsUvs?"#define USE_POINTS_UV":"",n.gradientMap?"#define USE_GRADIENTMAP":"",n.flatShading?"#define FLAT_SHADED":"",n.doubleSided?"#define DOUBLE_SIDED":"",n.flipSided?"#define FLIP_SIDED":"",n.shadowMapEnabled?"#define USE_SHADOWMAP":"",n.shadowMapEnabled?"#define "+c:"",n.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",n.numLightProbes>0?"#define USE_LIGHT_PROBES":"",n.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",n.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",n.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",n.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",n.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",n.toneMapping!==wn?"#define TONE_MAPPING":"",n.toneMapping!==wn?Ge.tonemapping_pars_fragment:"",n.toneMapping!==wn?$b("toneMapping",n.toneMapping):"",n.dithering?"#define DITHERING":"",n.opaque?"#define OPAQUE":"",Ge.colorspace_pars_fragment,Vb("linearToOutputTexel",n.outputColorSpace),Zb(),n.useDepthPacking?"#define DEPTH_PACKING "+n.depthPacking:"",`
`].filter(Ls).join(`
`);if(o=jl(o),o=gg(o,n),o=_g(o,n),a=jl(a),a=gg(a,n),a=_g(a,n),o=xg(o),a=xg(a),n.isRawShaderMaterial!==!0)T=`#version 300 es
`,p=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,m=["#define varying in",n.glslVersion===Sl?"":"layout(location = 0) out highp vec4 pc_fragColor;",n.glslVersion===Sl?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+m;let A=T+p+o,v=T+m+a,w=fg(r,r.VERTEX_SHADER,A),E=fg(r,r.FRAGMENT_SHADER,v);if(r.attachShader(S,w),r.attachShader(S,E),n.index0AttributeName!==void 0)r.bindAttribLocation(S,0,n.index0AttributeName);else if(n.hasPositionAttribute===!0)r.bindAttribLocation(S,0,"position");r.linkProgram(S);function R(U){if(e.debug.checkShaderErrors){let z=r.getProgramInfoLog(S)||"",N=r.getShaderInfoLog(w)||"",C=r.getShaderInfoLog(E)||"",F=z.trim(),V=N.trim(),G=C.trim(),ie=!0,X=!0;if(r.getProgramParameter(S,r.LINK_STATUS)===!1)if(ie=!1,typeof e.debug.onShaderError==="function")e.debug.onShaderError(r,S,w,E);else{let Q=mg(r,w,"vertex"),ee=mg(r,E,"fragment");De("WebGLProgram: Shader Error "+r.getError()+" - VALIDATE_STATUS "+r.getProgramParameter(S,r.VALIDATE_STATUS)+`

Material Name: `+U.name+`
Material Type: `+U.type+`

Program Info Log: `+F+`
`+Q+`
`+ee)}else if(F!=="")Te("WebGLProgram: Program Info Log:",F);else if(V===""||G==="")X=!1;if(X)U.diagnostics={runnable:ie,programLog:F,vertexShader:{log:V,prefix:p},fragmentShader:{log:G,prefix:m}}}r.deleteShader(w),r.deleteShader(E),x=new Ns(r,S),M=Yb(r,S)}let x;this.getUniforms=function(){if(x===void 0)R(this);return x};let M;this.getAttributes=function(){if(M===void 0)R(this);return M};let H=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){if(H===!1)H=r.getProgramParameter(S,kb);return H},this.destroy=function(){i.releaseStatesOfProgram(this),r.deleteProgram(S),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=Bb++,this.cacheKey=t,this.usedTimes=1,this.program=S,this.vertexShader=w,this.fragmentShader=E,this}var hM=0;class Ng{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let i=this._getShaderCacheForMaterial(e);if(i.has(t)===!1)i.add(t),t.usedTimes++;if(i.has(n)===!1)i.add(n),n.usedTimes++;return this}remove(e){let t=this.materialCache.get(e);for(let n of t)if(n.usedTimes--,n.usedTimes===0)this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);if(n===void 0)n=new Set,t.set(e,n);return n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);if(n===void 0)n=new Dg(e),t.set(e,n);return n}}class Dg{constructor(e){this.id=hM++,this.code=e,this.usedTimes=0}}function dM(e){return e===qi||e===Ho||e===Vo}function fM(e,t,n,i,r,s){let o=new ms,a=new Ng,c=new Set,l=[],u=new Map,{logarithmicDepthBuffer:d,precision:h}=i,f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(x){if(c.add(x),x===0)return"uv";return`uv${x}`}function S(x,M,H,U,z,N){let C=U.fog,F=z.geometry,V=x.isMeshStandardMaterial||x.isMeshLambertMaterial||x.isMeshPhongMaterial?U.environment:null,G=x.isMeshStandardMaterial||x.isMeshLambertMaterial&&!x.envMap||x.isMeshPhongMaterial&&!x.envMap,ie=t.get(x.envMap||V,G),X=!!ie&&ie.mapping===hs?ie.image.height:null,Q=f[x.type];if(x.precision!==null){if(h=i.getMaxPrecision(x.precision),h!==x.precision)Te("WebGLProgram.getParameters:",x.precision,"not supported, using",h,"instead.")}let ee=F.morphAttributes.position||F.morphAttributes.normal||F.morphAttributes.color,ve=ee!==void 0?ee.length:0,Ee=0;if(F.morphAttributes.position!==void 0)Ee=1;if(F.morphAttributes.normal!==void 0)Ee=2;if(F.morphAttributes.color!==void 0)Ee=3;let qe,ke,q,re;if(Q){let ut=Wn[Q];qe=ut.vertexShader,ke=ut.fragmentShader}else{qe=x.vertexShader,ke=x.fragmentShader;let ut=a.getVertexShaderStage(x),tt=a.getFragmentShaderStage(x);a.update(x,ut,tt),q=ut.id,re=tt.id}let se=e.getRenderTarget(),Pe=e.state.buffers.depth.getReversed(),Ne=z.isInstancedMesh===!0,Re=z.isBatchedMesh===!0,Ct=!!x.map,Ze=!!x.matcap,Ye=!!ie,it=!!x.aoMap,Je=!!x.lightMap,kt=!!x.bumpMap&&x.wireframe===!1,ft=!!x.normalMap,Yt=!!x.displacementMap,It=!!x.emissiveMap,Pt=!!x.metalnessMap,P=!!x.roughnessMap,Jt=x.anisotropy>0,et=x.clearcoat>0,_t=x.dispersion>0,b=x.retroreflectivity>0,_=x.iridescence>0,I=x.sheen>0,W=x.transmission>0,ne=Jt&&!!x.anisotropyMap,ae=et&&!!x.clearcoatMap,ue=et&&!!x.clearcoatNormalMap,Y=et&&!!x.clearcoatRoughnessMap,j=_&&!!x.iridescenceMap,ge=_&&!!x.iridescenceThicknessMap,we=I&&!!x.sheenColorMap,he=I&&!!x.sheenRoughnessMap,oe=!!x.specularMap,Ce=!!x.specularColorMap,Le=!!x.specularIntensityMap,je=W&&!!x.transmissionMap,D=W&&!!x.thicknessMap,ce=!!x.gradientMap,J=!!x.alphaMap,le=x.alphaTest>0,_e=!!x.alphaHash,te=!!x.extensions,fe=wn;if(x.toneMapped){if(se===null||se.isXRRenderTarget===!0)fe=e.toneMapping}let Fe={shaderID:Q,shaderType:x.type,shaderName:x.name,vertexShader:qe,fragmentShader:ke,defines:x.defines,customVertexShaderID:q,customFragmentShaderID:re,isRawShaderMaterial:x.isRawShaderMaterial===!0,glslVersion:x.glslVersion,precision:h,batching:Re,batchingColor:Re&&z._colorsTexture!==null,instancing:Ne,instancingColor:Ne&&z.instanceColor!==null,instancingMorph:Ne&&z.morphTexture!==null,outputColorSpace:se===null?e.outputColorSpace:se.isXRRenderTarget===!0?se.texture.colorSpace:He.workingColorSpace,alphaToCoverage:!!x.alphaToCoverage,map:Ct,matcap:Ze,envMap:Ye,envMapMode:Ye&&ie.mapping,envMapCubeUVHeight:X,aoMap:it,lightMap:Je,bumpMap:kt,normalMap:ft,displacementMap:Yt,emissiveMap:It,normalMapObjectSpace:ft&&x.normalMapType===Fm,normalMapTangentSpace:ft&&x.normalMapType===vl,packedNormalMap:ft&&x.normalMapType===vl&&dM(x.normalMap.format),metalnessMap:Pt,roughnessMap:P,anisotropy:Jt,anisotropyMap:ne,clearcoat:et,clearcoatMap:ae,clearcoatNormalMap:ue,clearcoatRoughnessMap:Y,dispersion:_t,retroreflection:b,iridescence:_,iridescenceMap:j,iridescenceThicknessMap:ge,sheen:I,sheenColorMap:we,sheenRoughnessMap:he,specularMap:oe,specularColorMap:Ce,specularIntensityMap:Le,transmission:W,transmissionMap:je,thicknessMap:D,gradientMap:ce,opaque:x.transparent===!1&&x.blending===us&&x.alphaToCoverage===!1,alphaMap:J,alphaTest:le,alphaHash:_e,combine:x.combine,mapUv:Ct&&g(x.map.channel),aoMapUv:it&&g(x.aoMap.channel),lightMapUv:Je&&g(x.lightMap.channel),bumpMapUv:kt&&g(x.bumpMap.channel),normalMapUv:ft&&g(x.normalMap.channel),displacementMapUv:Yt&&g(x.displacementMap.channel),emissiveMapUv:It&&g(x.emissiveMap.channel),metalnessMapUv:Pt&&g(x.metalnessMap.channel),roughnessMapUv:P&&g(x.roughnessMap.channel),anisotropyMapUv:ne&&g(x.anisotropyMap.channel),clearcoatMapUv:ae&&g(x.clearcoatMap.channel),clearcoatNormalMapUv:ue&&g(x.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Y&&g(x.clearcoatRoughnessMap.channel),iridescenceMapUv:j&&g(x.iridescenceMap.channel),iridescenceThicknessMapUv:ge&&g(x.iridescenceThicknessMap.channel),sheenColorMapUv:we&&g(x.sheenColorMap.channel),sheenRoughnessMapUv:he&&g(x.sheenRoughnessMap.channel),specularMapUv:oe&&g(x.specularMap.channel),specularColorMapUv:Ce&&g(x.specularColorMap.channel),specularIntensityMapUv:Le&&g(x.specularIntensityMap.channel),transmissionMapUv:je&&g(x.transmissionMap.channel),thicknessMapUv:D&&g(x.thicknessMap.channel),alphaMapUv:J&&g(x.alphaMap.channel),vertexTangents:!!F.attributes.tangent&&(ft||Jt),vertexNormals:!!F.attributes.normal,vertexColors:x.vertexColors,vertexAlphas:x.vertexColors===!0&&!!F.attributes.color&&F.attributes.color.itemSize===4,pointsUvs:z.isPoints===!0&&!!F.attributes.uv&&(Ct||J),fog:!!C,useFog:x.fog===!0,fogExp2:!!C&&C.isFogExp2,flatShading:x.wireframe===!1&&(x.flatShading===!0||F.attributes.normal===void 0&&ft===!1&&(x.isMeshLambertMaterial||x.isMeshPhongMaterial||x.isMeshStandardMaterial||x.isMeshPhysicalMaterial)),sizeAttenuation:x.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:Pe,skinning:z.isSkinnedMesh===!0,hasPositionAttribute:F.attributes.position!==void 0,morphTargets:F.morphAttributes.position!==void 0,morphNormals:F.morphAttributes.normal!==void 0,morphColors:F.morphAttributes.color!==void 0,morphTargetsCount:ve,morphTextureStride:Ee,numSunLights:M.sun.length,numDirLights:M.directional.length,numPointLights:M.point.length,numSpotLights:M.spot.length,numSpotLightMaps:M.spotLightMap.length,numRectAreaLights:M.rectArea.length,numHemiLights:M.hemi.length,numSunLightShadows:M.sunShadowMap.length,numDirLightShadows:M.directionalShadowMap.length,numPointLightShadows:M.pointShadowMap.length,numSpotLightShadows:M.spotShadowMap.length,numSpotLightShadowsWithMaps:M.numSpotLightShadowsWithMaps,numLightProbes:M.numLightProbes,numLightProbeGrids:N.length,numClippingPlanes:s.numPlanes,numClipIntersection:s.numIntersection,dithering:x.dithering,shadowMapEnabled:e.shadowMap.enabled&&H.length>0,shadowMapType:e.shadowMap.type,toneMapping:fe,decodeVideoTexture:Ct&&x.map.isVideoTexture===!0&&He.getTransfer(x.map.colorSpace)===lt,decodeVideoTextureEmissive:It&&x.emissiveMap.isVideoTexture===!0&&He.getTransfer(x.emissiveMap.colorSpace)===lt,premultipliedAlpha:x.premultipliedAlpha,doubleSided:x.side===pn,flipSided:x.side===jt,useDepthPacking:x.depthPacking>=0,depthPacking:x.depthPacking||0,index0AttributeName:x.index0AttributeName,extensionClipCullDistance:te&&x.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(te&&x.extensions.multiDraw===!0||Re)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:x.customProgramCacheKey()};return Fe.vertexUv1s=c.has(1),Fe.vertexUv2s=c.has(2),Fe.vertexUv3s=c.has(3),c.clear(),Fe}function p(x){let M=[];if(x.shaderID)M.push(x.shaderID);else M.push(x.customVertexShaderID),M.push(x.customFragmentShaderID);if(x.defines!==void 0)for(let H in x.defines)M.push(H),M.push(x.defines[H]);if(x.isRawShaderMaterial===!1)m(M,x),T(M,x),M.push(e.outputColorSpace);return M.push(x.customProgramCacheKey),M.join()}function m(x,M){x.push(M.precision),x.push(M.outputColorSpace),x.push(M.envMapMode),x.push(M.envMapCubeUVHeight),x.push(M.mapUv),x.push(M.alphaMapUv),x.push(M.lightMapUv),x.push(M.aoMapUv),x.push(M.bumpMapUv),x.push(M.normalMapUv),x.push(M.displacementMapUv),x.push(M.emissiveMapUv),x.push(M.metalnessMapUv),x.push(M.roughnessMapUv),x.push(M.anisotropyMapUv),x.push(M.clearcoatMapUv),x.push(M.clearcoatNormalMapUv),x.push(M.clearcoatRoughnessMapUv),x.push(M.iridescenceMapUv),x.push(M.iridescenceThicknessMapUv),x.push(M.sheenColorMapUv),x.push(M.sheenRoughnessMapUv),x.push(M.specularMapUv),x.push(M.specularColorMapUv),x.push(M.specularIntensityMapUv),x.push(M.transmissionMapUv),x.push(M.thicknessMapUv),x.push(M.combine),x.push(M.fogExp2),x.push(M.sizeAttenuation),x.push(M.morphTargetsCount),x.push(M.morphAttributeCount),x.push(M.numSunLights),x.push(M.numDirLights),x.push(M.numPointLights),x.push(M.numSpotLights),x.push(M.numSpotLightMaps),x.push(M.numHemiLights),x.push(M.numRectAreaLights),x.push(M.numSunLightShadows),x.push(M.numDirLightShadows),x.push(M.numPointLightShadows),x.push(M.numSpotLightShadows),x.push(M.numSpotLightShadowsWithMaps),x.push(M.numLightProbes),x.push(M.shadowMapType),x.push(M.toneMapping),x.push(M.numClippingPlanes),x.push(M.numClipIntersection),x.push(M.depthPacking)}function T(x,M){if(o.disableAll(),M.instancing)o.enable(0);if(M.instancingColor)o.enable(1);if(M.instancingMorph)o.enable(2);if(M.matcap)o.enable(3);if(M.envMap)o.enable(4);if(M.normalMapObjectSpace)o.enable(5);if(M.normalMapTangentSpace)o.enable(6);if(M.clearcoat)o.enable(7);if(M.iridescence)o.enable(8);if(M.alphaTest)o.enable(9);if(M.vertexColors)o.enable(10);if(M.vertexAlphas)o.enable(11);if(M.vertexUv1s)o.enable(12);if(M.vertexUv2s)o.enable(13);if(M.vertexUv3s)o.enable(14);if(M.vertexTangents)o.enable(15);if(M.anisotropy)o.enable(16);if(M.alphaHash)o.enable(17);if(M.batching)o.enable(18);if(M.dispersion)o.enable(19);if(M.retroreflection)o.enable(24);if(M.batchingColor)o.enable(20);if(M.gradientMap)o.enable(21);if(M.packedNormalMap)o.enable(22);if(M.vertexNormals)o.enable(23);if(x.push(o.mask),o.disableAll(),M.fog)o.enable(0);if(M.useFog)o.enable(1);if(M.flatShading)o.enable(2);if(M.logarithmicDepthBuffer)o.enable(3);if(M.reversedDepthBuffer)o.enable(4);if(M.skinning)o.enable(5);if(M.morphTargets)o.enable(6);if(M.morphNormals)o.enable(7);if(M.morphColors)o.enable(8);if(M.premultipliedAlpha)o.enable(9);if(M.shadowMapEnabled)o.enable(10);if(M.doubleSided)o.enable(11);if(M.flipSided)o.enable(12);if(M.useDepthPacking)o.enable(13);if(M.dithering)o.enable(14);if(M.transmission)o.enable(15);if(M.sheen)o.enable(16);if(M.opaque)o.enable(17);if(M.pointsUvs)o.enable(18);if(M.decodeVideoTexture)o.enable(19);if(M.decodeVideoTextureEmissive)o.enable(20);if(M.alphaToCoverage)o.enable(21);if(M.numLightProbeGrids>0)o.enable(22);if(M.hasPositionAttribute)o.enable(23);x.push(o.mask)}function A(x){let M=f[x.type],H;if(M){let U=Wn[M];H=Ym.clone(U.uniforms)}else H=x.uniforms;return H}function v(x,M){let H=u.get(M);if(H!==void 0)++H.usedTimes;else H=new uM(e,M,x,r),l.push(H),u.set(M,H);return H}function w(x){if(--x.usedTimes===0){let M=l.indexOf(x);l[M]=l[l.length-1],l.pop(),u.delete(x.cacheKey),x.destroy()}}function E(x){a.remove(x)}function R(){a.dispose()}return{getParameters:S,getProgramCacheKey:p,getUniforms:A,acquireProgram:v,releaseProgram:w,releaseShaderCache:E,programs:l,dispose:R}}function pM(){let e=new WeakMap;function t(o){return e.has(o)}function n(o){let a=e.get(o);if(a===void 0)a={},e.set(o,a);return a}function i(o){e.delete(o)}function r(o,a,c){e.get(o)[a]=c}function s(){e=new WeakMap}return{has:t,get:n,remove:i,update:r,dispose:s}}function mM(e,t){if(e.groupOrder!==t.groupOrder)return e.groupOrder-t.groupOrder;else if(e.renderOrder!==t.renderOrder)return e.renderOrder-t.renderOrder;else if(e.material.id!==t.material.id)return e.material.id-t.material.id;else if(e.materialVariant!==t.materialVariant)return e.materialVariant-t.materialVariant;else if(e.z!==t.z)return e.z-t.z;else return e.id-t.id}function yg(e,t){if(e.groupOrder!==t.groupOrder)return e.groupOrder-t.groupOrder;else if(e.renderOrder!==t.renderOrder)return e.renderOrder-t.renderOrder;else if(e.z!==t.z)return t.z-e.z;else return e.id-t.id}function Sg(){let e=[],t=0,n=[],i=[],r=[];function s(){t=0,n.length=0,i.length=0,r.length=0}function o(h){let f=0;if(h.isInstancedMesh)f+=2;if(h.isSkinnedMesh)f+=1;return f}function a(h,f,g,S,p,m){let T=e[t];if(T===void 0)T={id:h.id,object:h,geometry:f,material:g,materialVariant:o(h),groupOrder:S,renderOrder:h.renderOrder,z:p,group:m},e[t]=T;else T.id=h.id,T.object=h,T.geometry=f,T.material=g,T.materialVariant=o(h),T.groupOrder=S,T.renderOrder=h.renderOrder,T.z=p,T.group=m;return t++,T}function c(h,f,g,S,p,m,T){if(T.reversedDepth===!0)p=-p;let A=a(h,f,g,S,p,m);if(g.transmission>0)i.push(A);else if(g.transparent===!0)r.push(A);else n.push(A)}function l(h,f,g,S,p,m){let T=a(h,f,g,S,p,m);if(g.transmission>0)i.unshift(T);else if(g.transparent===!0)r.unshift(T);else n.unshift(T)}function u(h,f){if(n.length>1)n.sort(h||mM);if(i.length>1)i.sort(f||yg);if(r.length>1)r.sort(f||yg)}function d(){for(let h=t,f=e.length;h<f;h++){let g=e[h];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return{opaque:n,transmissive:i,transparent:r,init:s,push:c,unshift:l,finish:d,sort:u}}function gM(){let e=new WeakMap;function t(i,r){let s=e.get(i),o;if(s===void 0)o=new Sg,e.set(i,[o]);else if(r>=s.length)o=new Sg,s.push(o);else o=s[r];return o}function n(){e=new WeakMap}return{get:t,dispose:n}}function _M(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case"SunLight":case"DirectionalLight":n={direction:new O,color:new Ie};break;case"SpotLight":n={position:new O,direction:new O,color:new Ie,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":n={position:new O,color:new Ie,distance:0,decay:0};break;case"HemisphereLight":n={direction:new O,skyColor:new Ie,groundColor:new Ie};break;case"RectAreaLight":n={color:new Ie,position:new O,halfWidth:new O,halfHeight:new O};break}return e[t.id]=n,n}}}function xM(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case"SunLight":case"DirectionalLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ze};break;case"SpotLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ze};break;case"PointLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ze,shadowCameraNear:1,shadowCameraFar:1000};break}return e[t.id]=n,n}}}var vM=0;function yM(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+(t.map?1:0)-(e.map?1:0)}function SM(e){let t=new _M,n=xM(),i={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)i.probe.push(new O);let r=new O,s=new Oe,o=new Oe;function a(l){let u=0,d=0,h=0;for(let z=0;z<9;z++)i.probe[z].set(0,0,0);let f=0,g=0,S=0,p=0,m=0,T=0,A=0,v=0,w=0,E=0,R=0,x=0,M=0,H=0;l.sort(yM);for(let z=0,N=l.length;z<N;z++){let C=l[z],{color:F,intensity:V,distance:G}=C,ie=null;if(C.shadow&&C.shadow.map)if(C.shadow.map.texture.format===qi)ie=C.shadow.map.texture;else ie=C.shadow.map.depthTexture||C.shadow.map.texture;if(C.isAmbientLight)u+=F.r*V,d+=F.g*V,h+=F.b*V;else if(C.isLightProbe){for(let X=0;X<9;X++)i.probe[X].addScaledVector(C.sh.coefficients[X],V);H++}else if(C.isSunLight){let X=t.get(C);if(X.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){let Q=C.shadow,ee=n.get(C);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize.copy(Q.mapSize).multiply(Q.getFrameExtents()),i.sunShadow[g]=ee,i.sunShadowMap[g]=ie;let ve=Q.getViewportCount();for(let Ee=0;Ee<ve;Ee++)i.sunShadowMatrix[S+Ee]=Q.getMatrix(Ee),i.sunShadowCascade[S+Ee]=Q._cascadeData[Ee];S+=ve,g++}i.sun[f]=X,f++}else if(C.isDirectionalLight){let X=t.get(C);if(X.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){let Q=C.shadow,ee=n.get(C);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,i.directionalShadow[p]=ee,i.directionalShadowMap[p]=ie,i.directionalShadowMatrix[p]=C.shadow.matrix,w++}i.directional[p]=X,p++}else if(C.isSpotLight){let X=t.get(C);X.position.setFromMatrixPosition(C.matrixWorld),X.color.copy(F).multiplyScalar(V),X.distance=G,X.coneCos=Math.cos(C.angle),X.penumbraCos=Math.cos(C.angle*(1-C.penumbra)),X.decay=C.decay,i.spot[T]=X;let Q=C.shadow;if(C.map){if(i.spotLightMap[x]=C.map,x++,Q.updateMatrices(C),C.castShadow)M++}if(i.spotLightMatrix[T]=Q.matrix,C.castShadow){let ee=n.get(C);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,i.spotShadow[T]=ee,i.spotShadowMap[T]=ie,R++}T++}else if(C.isRectAreaLight){let X=t.get(C);X.color.copy(F).multiplyScalar(V),X.halfWidth.set(C.width*0.5,0,0),X.halfHeight.set(0,C.height*0.5,0),i.rectArea[A]=X,A++}else if(C.isPointLight){let X=t.get(C);if(X.color.copy(C.color).multiplyScalar(C.intensity),X.distance=C.distance,X.decay=C.decay,C.castShadow){let Q=C.shadow,ee=n.get(C);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,ee.shadowCameraNear=Q.camera.near,ee.shadowCameraFar=Q.camera.far,i.pointShadow[m]=ee,i.pointShadowMap[m]=ie,i.pointShadowMatrix[m]=C.shadow.matrix,E++}i.point[m]=X,m++}else if(C.isHemisphereLight){let X=t.get(C);X.skyColor.copy(C.color).multiplyScalar(V),X.groundColor.copy(C.groundColor).multiplyScalar(V),i.hemi[v]=X,v++}}if(A>0)if(e.has("OES_texture_float_linear")===!0)i.rectAreaLTC1=de.LTC_FLOAT_1,i.rectAreaLTC2=de.LTC_FLOAT_2;else i.rectAreaLTC1=de.LTC_HALF_1,i.rectAreaLTC2=de.LTC_HALF_2;i.ambient[0]=u,i.ambient[1]=d,i.ambient[2]=h;let U=i.hash;if(U.sunLength!==f||U.directionalLength!==p||U.pointLength!==m||U.spotLength!==T||U.rectAreaLength!==A||U.hemiLength!==v||U.numSunShadows!==g||U.numDirectionalShadows!==w||U.numPointShadows!==E||U.numSpotShadows!==R||U.numSpotMaps!==x||U.numLightProbes!==H)i.sun.length=f,i.directional.length=p,i.spot.length=T,i.rectArea.length=A,i.point.length=m,i.hemi.length=v,i.sunShadow.length=g,i.sunShadowMap.length=g,i.sunShadowMatrix.length=S,i.sunShadowCascade.length=S,i.directionalShadow.length=w,i.directionalShadowMap.length=w,i.directionalShadowMatrix.length=w,i.pointShadow.length=E,i.pointShadowMap.length=E,i.pointShadowMatrix.length=E,i.spotShadow.length=R,i.spotShadowMap.length=R,i.spotLightMatrix.length=R+x-M,i.spotLightMap.length=x,i.numSpotLightShadowsWithMaps=M,i.numLightProbes=H,U.sunLength=f,U.directionalLength=p,U.pointLength=m,U.spotLength=T,U.rectAreaLength=A,U.hemiLength=v,U.numSunShadows=g,U.numDirectionalShadows=w,U.numPointShadows=E,U.numSpotShadows=R,U.numSpotMaps=x,U.numLightProbes=H,i.version=vM++}function c(l,u){let d=0,h=0,f=0,g=0,S=0,p=0,m=u.matrixWorldInverse;for(let T=0,A=l.length;T<A;T++){let v=l[T];if(v.isSunLight){let w=i.sun[d];w.direction.setFromMatrixPosition(v.matrixWorld),w.direction.transformDirection(m),d++}else if(v.isDirectionalLight){let w=i.directional[h];w.direction.setFromMatrixPosition(v.matrixWorld),r.setFromMatrixPosition(v.target.matrixWorld),w.direction.sub(r),w.direction.transformDirection(m),h++}else if(v.isSpotLight){let w=i.spot[g];w.position.setFromMatrixPosition(v.matrixWorld),w.position.applyMatrix4(m),w.direction.setFromMatrixPosition(v.matrixWorld),r.setFromMatrixPosition(v.target.matrixWorld),w.direction.sub(r),w.direction.transformDirection(m),g++}else if(v.isRectAreaLight){let w=i.rectArea[S];w.position.setFromMatrixPosition(v.matrixWorld),w.position.applyMatrix4(m),o.identity(),s.copy(v.matrixWorld),s.premultiply(m),o.extractRotation(s),w.halfWidth.set(v.width*0.5,0,0),w.halfHeight.set(0,v.height*0.5,0),w.halfWidth.applyMatrix4(o),w.halfHeight.applyMatrix4(o),S++}else if(v.isPointLight){let w=i.point[f];w.position.setFromMatrixPosition(v.matrixWorld),w.position.applyMatrix4(m),f++}else if(v.isHemisphereLight){let w=i.hemi[p];w.direction.setFromMatrixPosition(v.matrixWorld),w.direction.transformDirection(m),p++}}}return{setup:a,setupView:c,state:i}}function bg(e){let t=new SM(e),n=[],i=[],r=[];function s(h){d.camera=h,n.length=0,i.length=0,r.length=0}function o(h){n.push(h)}function a(h){i.push(h)}function c(h){r.push(h)}function l(){t.setup(n)}function u(h){t.setupView(n,h)}let d={lightsArray:n,shadowsArray:i,lightProbeGridArray:r,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:s,state:d,setupLights:l,setupLightsView:u,pushLight:o,pushShadow:a,pushLightProbeGrid:c}}function bM(e){let t=new WeakMap;function n(r,s=0){let o=t.get(r),a;if(o===void 0)a=new bg(e),t.set(r,[a]);else if(s>=o.length)a=new bg(e),o.push(a);else a=o[s];return a}function i(){t=new WeakMap}return{get:n,dispose:i}}var MM=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,wM=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,TM=[new O(1,0,0),new O(-1,0,0),new O(0,1,0),new O(0,-1,0),new O(0,0,1),new O(0,0,-1)],EM=[new O(0,-1,0),new O(0,-1,0),new O(0,0,1),new O(0,0,-1),new O(0,-1,0),new O(0,-1,0)],Mg=new Oe,Ps=new O,Yl=new O;function AM(e,t,n){let i=new Ss,r=new ze,s=new ze,o=new ot,a=new Es,c=new Il,l={},u=n.maxTextureSize,d={[bi]:jt,[jt]:bi,[pn]:pn},h=new _n({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new ze},radius:{value:4}},vertexShader:MM,fragmentShader:wM}),f=h.clone();f.defines.HORIZONTAL_PASS=1;let g=new Tt;g.setAttribute("position",new Ft(new Float32Array([-1,-1,0.5,3,-1,0.5,-1,3,0.5]),3));let S=new vt(g,h),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=ls;let m=this.type;this.render=function(E,R,x){if(p.enabled===!1)return;if(p.autoUpdate===!1&&p.needsUpdate===!1)return;if(E.length===0)return;if(this.type===Qp)Te("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=ls;let M=e.getRenderTarget(),H=e.getActiveCubeFace(),U=e.getActiveMipmapLevel(),z=e.state;if(z.setBlending(Dn),z.buffers.depth.getReversed()===!0)z.buffers.color.setClear(0,0,0,0);else z.buffers.color.setClear(1,1,1,1);z.buffers.depth.setTest(!0),z.setScissorTest(!1);let N=m!==this.type;if(N)R.traverse(function(C){if(C.material)if(Array.isArray(C.material))C.material.forEach((F)=>F.needsUpdate=!0);else C.material.needsUpdate=!0});for(let C=0,F=E.length;C<F;C++){let V=E[C],G=V.shadow;if(G===void 0){Te("WebGLShadowMap:",V,"has no shadow.");continue}if(G.autoUpdate===!1&&G.needsUpdate===!1)continue;r.copy(G.mapSize);let ie=G.getFrameExtents();if(r.multiply(ie),s.copy(G.mapSize),r.x>u||r.y>u){if(r.x>u)s.x=Math.floor(u/ie.x),r.x=s.x*ie.x,G.mapSize.x=s.x;if(r.y>u)s.y=Math.floor(u/ie.y),r.y=s.y*ie.y,G.mapSize.y=s.y}let X=e.state.buffers.depth.getReversed();if(G.camera._reversedDepth=X,G.map===null||N===!0){if(G.map!==null){if(G.map.depthTexture!==null)G.map.depthTexture.dispose(),G.map.depthTexture=null;G.map.dispose()}if(this.type===Er){if(V.isPointLight){Te("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}G.map=new rn(r.x,r.y,{format:qi,type:On,minFilter:zt,magFilter:zt,generateMipmaps:!1}),G.map.texture.name=V.name+".shadowMap",G.map.depthTexture=new Ki(r.x,r.y,si),G.map.depthTexture.name=V.name+".shadowMapDepth",G.map.depthTexture.format=Zi,G.map.depthTexture.compareFunction=null,G.map.depthTexture.minFilter=Tn,G.map.depthTexture.magFilter=Tn}else{if(V.isPointLight)G.map=new Ql(r.x),G.map.depthTexture=new Al(r.x,Mi);else G.map=new rn(r.x,r.y),G.map.depthTexture=new Ki(r.x,r.y,Mi);if(G.map.depthTexture.name=V.name+".shadowMap",G.map.depthTexture.format=Zi,this.type===ls)G.map.depthTexture.compareFunction=X?Zo:$o,G.map.depthTexture.minFilter=zt,G.map.depthTexture.magFilter=zt;else G.map.depthTexture.compareFunction=null,G.map.depthTexture.minFilter=Tn,G.map.depthTexture.magFilter=Tn}G.camera.updateProjectionMatrix()}if(G.map.isWebGLCubeRenderTarget!==!0&&(G.map.width!==r.x||G.map.height!==r.y))G.map.setSize(r.x,r.y);let Q=G.map.isWebGLCubeRenderTarget?6:G.getViewportCount();if(V.isPointLight!==!0)G.updateMatrices(V,x);for(let ee=0;ee<Q;ee++){let ve=G.getCamera(ee);if(V.isPointLight){let{camera:Ee,matrix:qe}=G,ke=V.distance||Ee.far;if(ke!==Ee.far)Ee.far=ke,Ee.updateProjectionMatrix();Ps.setFromMatrixPosition(V.matrixWorld),Ee.position.copy(Ps),Yl.copy(Ee.position),Yl.add(TM[ee]),Ee.up.copy(EM[ee]),Ee.lookAt(Yl),Ee.updateMatrixWorld(),qe.makeTranslation(-Ps.x,-Ps.y,-Ps.z),Mg.multiplyMatrices(Ee.projectionMatrix,Ee.matrixWorldInverse),G._frustum.setFromProjectionMatrix(Mg,Ee.coordinateSystem,Ee.reversedDepth)}if(G.map.isWebGLCubeRenderTarget)e.setRenderTarget(G.map,ee),e.clear();else{if(ee===0)e.setRenderTarget(G.map),e.clear();let Ee=G.getViewport(ee);o.set(s.x*Ee.x,s.y*Ee.y,s.x*Ee.z,s.y*Ee.w),z.viewport(o)}i=G.getFrustum(ee),v(R,x,ve,V,this.type)}if(G.isPointLightShadow!==!0&&this.type===Er)T(G,x);G.needsUpdate=!1}m=this.type,p.needsUpdate=!1,e.setRenderTarget(M,H,U)};function T(E,R){let x=t.update(S);if(h.defines.VSM_SAMPLES!==E.blurSamples)h.defines.VSM_SAMPLES=E.blurSamples,f.defines.VSM_SAMPLES=E.blurSamples,h.needsUpdate=!0,f.needsUpdate=!0;if(E.mapPass===null)E.mapPass=new rn(r.x,r.y,{format:qi,type:On});else if(E.mapPass.width!==E.map.width||E.mapPass.height!==E.map.height)E.mapPass.setSize(E.map.width,E.map.height);h.uniforms.shadow_pass.value=E.map.depthTexture,h.uniforms.resolution.value.set(E.map.width,E.map.height),h.uniforms.radius.value=E.radius,e.setRenderTarget(E.mapPass),e.clear(),e.renderBufferDirect(R,null,x,h,S,null),f.uniforms.shadow_pass.value=E.mapPass.texture,f.uniforms.resolution.value.set(E.map.width,E.map.height),f.uniforms.radius.value=E.radius,e.setRenderTarget(E.map),e.clear(),e.renderBufferDirect(R,null,x,f,S,null)}function A(E,R,x,M){let H=null,U=x.isPointLight===!0?E.customDistanceMaterial:E.customDepthMaterial;if(U!==void 0)H=U;else if(H=x.isPointLight===!0?c:a,e.localClippingEnabled&&R.clipShadows===!0&&Array.isArray(R.clippingPlanes)&&R.clippingPlanes.length!==0||R.displacementMap&&R.displacementScale!==0||R.alphaMap&&R.alphaTest>0||R.map&&R.alphaTest>0||R.alphaToCoverage===!0){let z=H.uuid,N=R.uuid,C=l[z];if(C===void 0)C={},l[z]=C;let F=C[N];if(F===void 0)F=H.clone(),C[N]=F,R.addEventListener("dispose",w);H=F}if(H.visible=R.visible,H.wireframe=R.wireframe,M===Er)H.side=R.shadowSide!==null?R.shadowSide:R.side;else H.side=R.shadowSide!==null?R.shadowSide:d[R.side];if(H.alphaMap=R.alphaMap,H.alphaTest=R.alphaToCoverage===!0?0.5:R.alphaTest,H.map=R.map,H.clipShadows=R.clipShadows,H.clippingPlanes=R.clippingPlanes,H.clipIntersection=R.clipIntersection,H.displacementMap=R.displacementMap,H.displacementScale=R.displacementScale,H.displacementBias=R.displacementBias,H.wireframeLinewidth=R.wireframeLinewidth,H.linewidth=R.linewidth,x.isPointLight===!0&&H.isMeshDistanceMaterial===!0){let z=e.properties.get(H);z.light=x}return H}function v(E,R,x,M,H){if(E.visible===!1)return;if(E.layers.test(R.layers)&&(E.isMesh||E.isLine||E.isPoints)){if((E.castShadow||E.receiveShadow&&H===Er)&&(!E.frustumCulled||E.intersectsFrustum(i))){E.modelViewMatrix.multiplyMatrices(x.matrixWorldInverse,E.matrixWorld);let N=t.update(E),C=E.material;if(Array.isArray(C)){let F=N.groups;for(let V=0,G=F.length;V<G;V++){let ie=F[V],X=C[ie.materialIndex];if(X&&X.visible){let Q=A(E,X,M,H);E.onBeforeShadow(e,E,R,x,N,Q,ie),e.renderBufferDirect(x,null,N,Q,E,ie),E.onAfterShadow(e,E,R,x,N,Q,ie)}}}else if(C.visible){let F=A(E,C,M,H);E.onBeforeShadow(e,E,R,x,N,F,null),e.renderBufferDirect(x,null,N,F,E,null),E.onAfterShadow(e,E,R,x,N,F,null)}}}let z=E.children;for(let N=0,C=z.length;N<C;N++)v(z[N],R,x,M,H)}function w(E){E.target.removeEventListener("dispose",w);for(let x in l){let M=l[x],H=E.target.uuid;if(H in M)M[H].dispose(),delete M[H]}}}function RM(e,t){function n(){let D=!1,ce=new ot,J=null,le=new ot(0,0,0,0);return{setMask:function(_e){if(J!==_e&&!D)e.colorMask(_e,_e,_e,_e),J=_e},setLocked:function(_e){D=_e},setClear:function(_e,te,fe,Fe,ut){if(ut===!0)_e*=Fe,te*=Fe,fe*=Fe;if(ce.set(_e,te,fe,Fe),le.equals(ce)===!1)e.clearColor(_e,te,fe,Fe),le.copy(ce)},reset:function(){D=!1,J=null,le.set(-1,0,0,0)}}}function i(){let D=!1,ce=!1,J=null,le=null,_e=null;return{setReversed:function(te){if(ce!==te){let fe=t.get("EXT_clip_control");if(te)fe.clipControlEXT(fe.LOWER_LEFT_EXT,fe.ZERO_TO_ONE_EXT);else fe.clipControlEXT(fe.LOWER_LEFT_EXT,fe.NEGATIVE_ONE_TO_ONE_EXT);ce=te;let Fe=_e;_e=null,this.setClear(Fe)}},getReversed:function(){return ce},setTest:function(te){if(te)se(e.DEPTH_TEST);else Pe(e.DEPTH_TEST)},setMask:function(te){if(J!==te&&!D)e.depthMask(te),J=te},setFunc:function(te){if(ce)te=Xm[te];if(le!==te){switch(te){case ym:e.depthFunc(e.NEVER);break;case Sm:e.depthFunc(e.ALWAYS);break;case bm:e.depthFunc(e.LESS);break;case Ec:e.depthFunc(e.LEQUAL);break;case Mm:e.depthFunc(e.EQUAL);break;case wm:e.depthFunc(e.GEQUAL);break;case Tm:e.depthFunc(e.GREATER);break;case Em:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}le=te}},setLocked:function(te){D=te},setClear:function(te){if(_e!==te){if(_e=te,ce)te=1-te;e.clearDepth(te)}},reset:function(){D=!1,J=null,le=null,_e=null,ce=!1}}}function r(){let D=!1,ce=null,J=null,le=null,_e=null,te=null,fe=null,Fe=null,ut=null;return{setTest:function(tt){if(!D)if(tt)se(e.STENCIL_TEST);else Pe(e.STENCIL_TEST)},setMask:function(tt){if(ce!==tt&&!D)e.stencilMask(tt),ce=tt},setFunc:function(tt,Rn,Zn){if(J!==tt||le!==Rn||_e!==Zn)e.stencilFunc(tt,Rn,Zn),J=tt,le=Rn,_e=Zn},setOp:function(tt,Rn,Zn){if(te!==tt||fe!==Rn||Fe!==Zn)e.stencilOp(tt,Rn,Zn),te=tt,fe=Rn,Fe=Zn},setLocked:function(tt){D=tt},setClear:function(tt){if(ut!==tt)e.clearStencil(tt),ut=tt},reset:function(){D=!1,ce=null,J=null,le=null,_e=null,te=null,fe=null,Fe=null,ut=null}}}let s=new n,o=new i,a=new r,c=new WeakMap,l=new WeakMap,u={},d={},h={},f=new WeakMap,g=[],S=null,p=!1,m=null,T=null,A=null,v=null,w=null,E=null,R=null,x=new Ie(0,0,0),M=0,H=!1,U=null,z=null,N=null,C=null,F=null,V=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),G=!1,ie=0,X=e.getParameter(e.VERSION);if(X.indexOf("WebGL")!==-1)ie=parseFloat(/^WebGL (\d)/.exec(X)[1]),G=ie>=1;else if(X.indexOf("OpenGL ES")!==-1)ie=parseFloat(/^OpenGL ES (\d)/.exec(X)[1]),G=ie>=2;let Q=null,ee={},ve=e.getParameter(e.SCISSOR_BOX),Ee=e.getParameter(e.VIEWPORT),qe=new ot().fromArray(ve),ke=new ot().fromArray(Ee);function q(D,ce,J,le){let _e=new Uint8Array(4),te=e.createTexture();e.bindTexture(D,te),e.texParameteri(D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(D,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let fe=0;fe<J;fe++)if(D===e.TEXTURE_3D||D===e.TEXTURE_2D_ARRAY)e.texImage3D(ce,0,e.RGBA,1,1,le,0,e.RGBA,e.UNSIGNED_BYTE,_e);else e.texImage2D(ce+fe,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,_e);return te}let re={};re[e.TEXTURE_2D]=q(e.TEXTURE_2D,e.TEXTURE_2D,1),re[e.TEXTURE_CUBE_MAP]=q(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),re[e.TEXTURE_2D_ARRAY]=q(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),re[e.TEXTURE_3D]=q(e.TEXTURE_3D,e.TEXTURE_3D,1,1),s.setClear(0,0,0,1),o.setClear(1),a.setClear(0),se(e.DEPTH_TEST),o.setFunc(Ec),kt(!1),ft(bc),se(e.CULL_FACE),it(Dn);function se(D){if(u[D]!==!0)e.enable(D),u[D]=!0}function Pe(D){if(u[D]!==!1)e.disable(D),u[D]=!1}function Ne(D,ce){if(h[D]!==ce){if(e.bindFramebuffer(D,ce),h[D]=ce,D===e.DRAW_FRAMEBUFFER)h[e.FRAMEBUFFER]=ce;if(D===e.FRAMEBUFFER)h[e.DRAW_FRAMEBUFFER]=ce;return!0}return!1}function Re(D,ce){let J=g,le=!1;if(D){if(J=f.get(ce),J===void 0)J=[],f.set(ce,J);let _e=D.textures;if(J.length!==_e.length||J[0]!==e.COLOR_ATTACHMENT0){for(let te=0,fe=_e.length;te<fe;te++)J[te]=e.COLOR_ATTACHMENT0+te;J.length=_e.length,le=!0}}else if(J[0]!==e.BACK)J[0]=e.BACK,le=!0;if(le)e.drawBuffers(J)}function Ct(D){if(S!==D)return e.useProgram(D),S=D,!0;return!1}let Ze={[Ar]:e.FUNC_ADD,[tm]:e.FUNC_SUBTRACT,[nm]:e.FUNC_REVERSE_SUBTRACT};Ze[im]=e.MIN,Ze[rm]=e.MAX;let Ye={[sm]:e.ZERO,[om]:e.ONE,[am]:e.SRC_COLOR,[lm]:e.SRC_ALPHA,[mm]:e.SRC_ALPHA_SATURATE,[fm]:e.DST_COLOR,[hm]:e.DST_ALPHA,[cm]:e.ONE_MINUS_SRC_COLOR,[um]:e.ONE_MINUS_SRC_ALPHA,[pm]:e.ONE_MINUS_DST_COLOR,[dm]:e.ONE_MINUS_DST_ALPHA,[gm]:e.CONSTANT_COLOR,[_m]:e.ONE_MINUS_CONSTANT_COLOR,[xm]:e.CONSTANT_ALPHA,[vm]:e.ONE_MINUS_CONSTANT_ALPHA};function it(D,ce,J,le,_e,te,fe,Fe,ut,tt){if(D===Dn){if(p===!0)Pe(e.BLEND),p=!1;return}if(p===!1)se(e.BLEND),p=!0;if(D!==em){if(D!==m||tt!==H){if(T!==Ar||w!==Ar)e.blendEquation(e.FUNC_ADD),T=Ar,w=Ar;if(tt)switch(D){case us:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Mc:e.blendFunc(e.ONE,e.ONE);break;case wc:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case Tc:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:De("WebGLState: Invalid blending: ",D);break}else switch(D){case us:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Mc:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case wc:De("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Tc:De("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:De("WebGLState: Invalid blending: ",D);break}A=null,v=null,E=null,R=null,x.set(0,0,0),M=0,m=D,H=tt}return}if(_e=_e||ce,te=te||J,fe=fe||le,ce!==T||_e!==w)e.blendEquationSeparate(Ze[ce],Ze[_e]),T=ce,w=_e;if(J!==A||le!==v||te!==E||fe!==R)e.blendFuncSeparate(Ye[J],Ye[le],Ye[te],Ye[fe]),A=J,v=le,E=te,R=fe;if(Fe.equals(x)===!1||ut!==M)e.blendColor(Fe.r,Fe.g,Fe.b,ut),x.copy(Fe),M=ut;m=D,H=!1}function Je(D,ce){D.side===pn?Pe(e.CULL_FACE):se(e.CULL_FACE);let J=D.side===jt;if(ce)J=!J;kt(J),D.blending===us&&D.transparent===!1?it(Dn):it(D.blending,D.blendEquation,D.blendSrc,D.blendDst,D.blendEquationAlpha,D.blendSrcAlpha,D.blendDstAlpha,D.blendColor,D.blendAlpha,D.premultipliedAlpha),o.setFunc(D.depthFunc),o.setTest(D.depthTest),o.setMask(D.depthWrite),s.setMask(D.colorWrite);let le=D.stencilWrite;if(a.setTest(le),le)a.setMask(D.stencilWriteMask),a.setFunc(D.stencilFunc,D.stencilRef,D.stencilFuncMask),a.setOp(D.stencilFail,D.stencilZFail,D.stencilZPass);It(D.polygonOffset,D.polygonOffsetFactor,D.polygonOffsetUnits),D.alphaToCoverage===!0?se(e.SAMPLE_ALPHA_TO_COVERAGE):Pe(e.SAMPLE_ALPHA_TO_COVERAGE)}function kt(D){if(U!==D){if(D)e.frontFace(e.CW);else e.frontFace(e.CCW);U=D}}function ft(D){if(D!==Kp){if(se(e.CULL_FACE),D!==z)if(D===bc)e.cullFace(e.BACK);else if(D===jp)e.cullFace(e.FRONT);else e.cullFace(e.FRONT_AND_BACK)}else Pe(e.CULL_FACE);z=D}function Yt(D){if(D!==N){if(G)e.lineWidth(D);N=D}}function It(D,ce,J){if(D){if(se(e.POLYGON_OFFSET_FILL),C!==ce||F!==J){if(C=ce,F=J,o.getReversed())ce=-ce;e.polygonOffset(ce,J)}}else Pe(e.POLYGON_OFFSET_FILL)}function Pt(D){if(D)se(e.SCISSOR_TEST);else Pe(e.SCISSOR_TEST)}function P(D){if(D===void 0)D=e.TEXTURE0+V-1;if(Q!==D)e.activeTexture(D),Q=D}function Jt(D,ce,J){if(J===void 0)if(Q===null)J=e.TEXTURE0+V-1;else J=Q;let le=ee[J];if(le===void 0)le={type:void 0,texture:void 0},ee[J]=le;if(le.type!==D||le.texture!==ce){if(Q!==J)e.activeTexture(J),Q=J;e.bindTexture(D,ce||re[D]),le.type=D,le.texture=ce}}function et(){let D=ee[Q];if(D!==void 0&&D.type!==void 0)e.bindTexture(D.type,null),D.type=void 0,D.texture=void 0}function _t(){try{e.compressedTexImage2D(...arguments)}catch(D){De("WebGLState:",D)}}function b(){try{e.compressedTexImage3D(...arguments)}catch(D){De("WebGLState:",D)}}function _(){try{e.texSubImage2D(...arguments)}catch(D){De("WebGLState:",D)}}function I(){try{e.texSubImage3D(...arguments)}catch(D){De("WebGLState:",D)}}function W(){try{e.compressedTexSubImage2D(...arguments)}catch(D){De("WebGLState:",D)}}function ne(){try{e.compressedTexSubImage3D(...arguments)}catch(D){De("WebGLState:",D)}}function ae(){try{e.texStorage2D(...arguments)}catch(D){De("WebGLState:",D)}}function ue(){try{e.texStorage3D(...arguments)}catch(D){De("WebGLState:",D)}}function Y(){try{e.texImage2D(...arguments)}catch(D){De("WebGLState:",D)}}function j(){try{e.texImage3D(...arguments)}catch(D){De("WebGLState:",D)}}function ge(D){if(d[D]!==void 0)return d[D];else return e.getParameter(D)}function we(D,ce){if(d[D]!==ce)e.pixelStorei(D,ce),d[D]=ce}function he(D){if(qe.equals(D)===!1)e.scissor(D.x,D.y,D.z,D.w),qe.copy(D)}function oe(D){if(ke.equals(D)===!1)e.viewport(D.x,D.y,D.z,D.w),ke.copy(D)}function Ce(D,ce){let J=l.get(ce);if(J===void 0)J=new WeakMap,l.set(ce,J);let le=J.get(D);if(le===void 0)le=e.getUniformBlockIndex(ce,D.name),J.set(D,le)}function Le(D,ce){let le=l.get(ce).get(D);if(c.get(ce)!==le)e.uniformBlockBinding(ce,le,D.__bindingPointIndex),c.set(ce,le)}function je(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),u={},d={},Q=null,ee={},h={},f=new WeakMap,g=[],S=null,p=!1,m=null,T=null,A=null,v=null,w=null,E=null,R=null,x=new Ie(0,0,0),M=0,H=!1,U=null,z=null,N=null,C=null,F=null,qe.set(0,0,e.canvas.width,e.canvas.height),ke.set(0,0,e.canvas.width,e.canvas.height),s.reset(),o.reset(),a.reset()}return{buffers:{color:s,depth:o,stencil:a},enable:se,disable:Pe,bindFramebuffer:Ne,drawBuffers:Re,useProgram:Ct,setBlending:it,setMaterial:Je,setFlipSided:kt,setCullFace:ft,setLineWidth:Yt,setPolygonOffset:It,setScissorTest:Pt,activeTexture:P,bindTexture:Jt,unbindTexture:et,compressedTexImage2D:_t,compressedTexImage3D:b,texImage2D:Y,texImage3D:j,pixelStorei:we,getParameter:ge,updateUBOMapping:Ce,uniformBlockBinding:Le,texStorage2D:ae,texStorage3D:ue,texSubImage2D:_,texSubImage3D:I,compressedTexSubImage2D:W,compressedTexSubImage3D:ne,scissor:he,viewport:oe,reset:je}}function CM(e,t,n,i,r,s,o){let a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new ze,u=new WeakMap,d=new Set,h,f=new WeakMap,g=!1;try{g=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch(b){}function S(b,_){return g?new OffscreenCanvas(b,_):wr("canvas")}function p(b,_,I){let W=1,ne=_t(b);if(ne.width>I||ne.height>I)W=I/Math.max(ne.width,ne.height);if(W<1)if(typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&b instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&b instanceof ImageBitmap||typeof VideoFrame<"u"&&b instanceof VideoFrame){let ae=Math.floor(W*ne.width),ue=Math.floor(W*ne.height);if(h===void 0)h=S(ae,ue);let Y=_?S(ae,ue):h;return Y.width=ae,Y.height=ue,Y.getContext("2d").drawImage(b,0,0,ae,ue),Te("WebGLRenderer: Texture has been resized from ("+ne.width+"x"+ne.height+") to ("+ae+"x"+ue+")."),Y}else{if("data"in b)Te("WebGLRenderer: Image in DataTexture is too big ("+ne.width+"x"+ne.height+").");return b}return b}function m(b){return b.generateMipmaps}function T(b){e.generateMipmap(b)}function A(b){if(b.isWebGLCubeRenderTarget)return e.TEXTURE_CUBE_MAP;if(b.isWebGL3DRenderTarget)return e.TEXTURE_3D;if(b.isWebGLArrayRenderTarget||b.isCompressedArrayTexture)return e.TEXTURE_2D_ARRAY;return e.TEXTURE_2D}function v(b,_,I,W,ne,ae=!1){if(b!==null){if(e[b]!==void 0)return e[b];Te("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+b+"'")}let ue;if(W){if(ue=t.get("EXT_texture_norm16"),!ue)Te("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension")}let Y=_;if(_===e.RED){if(I===e.FLOAT)Y=e.R32F;if(I===e.HALF_FLOAT)Y=e.R16F;if(I===e.UNSIGNED_BYTE)Y=e.R8;if(I===e.UNSIGNED_SHORT&&ue)Y=ue.R16_EXT;if(I===e.SHORT&&ue)Y=ue.R16_SNORM_EXT}if(_===e.RED_INTEGER){if(I===e.UNSIGNED_BYTE)Y=e.R8UI;if(I===e.UNSIGNED_SHORT)Y=e.R16UI;if(I===e.UNSIGNED_INT)Y=e.R32UI;if(I===e.BYTE)Y=e.R8I;if(I===e.SHORT)Y=e.R16I;if(I===e.INT)Y=e.R32I}if(_===e.RG){if(I===e.FLOAT)Y=e.RG32F;if(I===e.HALF_FLOAT)Y=e.RG16F;if(I===e.UNSIGNED_BYTE)Y=e.RG8;if(I===e.UNSIGNED_SHORT&&ue)Y=ue.RG16_EXT;if(I===e.SHORT&&ue)Y=ue.RG16_SNORM_EXT}if(_===e.RG_INTEGER){if(I===e.UNSIGNED_BYTE)Y=e.RG8UI;if(I===e.UNSIGNED_SHORT)Y=e.RG16UI;if(I===e.UNSIGNED_INT)Y=e.RG32UI;if(I===e.BYTE)Y=e.RG8I;if(I===e.SHORT)Y=e.RG16I;if(I===e.INT)Y=e.RG32I}if(_===e.RGB_INTEGER){if(I===e.UNSIGNED_BYTE)Y=e.RGB8UI;if(I===e.UNSIGNED_SHORT)Y=e.RGB16UI;if(I===e.UNSIGNED_INT)Y=e.RGB32UI;if(I===e.BYTE)Y=e.RGB8I;if(I===e.SHORT)Y=e.RGB16I;if(I===e.INT)Y=e.RGB32I}if(_===e.RGBA_INTEGER){if(I===e.UNSIGNED_BYTE)Y=e.RGBA8UI;if(I===e.UNSIGNED_SHORT)Y=e.RGBA16UI;if(I===e.UNSIGNED_INT)Y=e.RGBA32UI;if(I===e.BYTE)Y=e.RGBA8I;if(I===e.SHORT)Y=e.RGBA16I;if(I===e.INT)Y=e.RGBA32I}if(_===e.RGB){if(I===e.UNSIGNED_SHORT&&ue)Y=ue.RGB16_EXT;if(I===e.SHORT&&ue)Y=ue.RGB16_SNORM_EXT;if(I===e.UNSIGNED_INT_5_9_9_9_REV)Y=e.RGB9_E5;if(I===e.UNSIGNED_INT_10F_11F_11F_REV)Y=e.R11F_G11F_B10F}if(_===e.RGBA){let j=ae?yl:He.getTransfer(ne);if(I===e.FLOAT)Y=e.RGBA32F;if(I===e.HALF_FLOAT)Y=e.RGBA16F;if(I===e.UNSIGNED_BYTE)Y=j===lt?e.SRGB8_ALPHA8:e.RGBA8;if(I===e.UNSIGNED_SHORT&&ue)Y=ue.RGBA16_EXT;if(I===e.SHORT&&ue)Y=ue.RGBA16_SNORM_EXT;if(I===e.UNSIGNED_SHORT_4_4_4_4)Y=e.RGBA4;if(I===e.UNSIGNED_SHORT_5_5_5_1)Y=e.RGB5_A1}if(Y===e.R16F||Y===e.R32F||Y===e.RG16F||Y===e.RG32F||Y===e.RGBA16F||Y===e.RGBA32F)t.get("EXT_color_buffer_float");return Y}function w(b,_){let I;if(b){if(_===null||_===Mi||_===Lr)I=e.DEPTH24_STENCIL8;else if(_===si)I=e.DEPTH32F_STENCIL8;else if(_===ds)I=e.DEPTH24_STENCIL8,Te("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")}else if(_===null||_===Mi||_===Lr)I=e.DEPTH_COMPONENT24;else if(_===si)I=e.DEPTH_COMPONENT32F;else if(_===ds)I=e.DEPTH_COMPONENT16;return I}function E(b,_){if(m(b)===!0||b.isFramebufferTexture&&b.minFilter!==Tn&&b.minFilter!==zt)return Math.log2(Math.max(_.width,_.height))+1;else if(b.mipmaps!==void 0&&b.mipmaps.length>0)return b.mipmaps.length;else if(b.isCompressedTexture&&Array.isArray(b.image))return _.mipmaps.length;else return 1}function R(b){let _=b.target;if(_.removeEventListener("dispose",R),M(_),_.isVideoTexture)u.delete(_);if(_.isHTMLTexture)d.delete(_)}function x(b){let _=b.target;_.removeEventListener("dispose",x),U(_)}function M(b){let _=i.get(b);if(_.__webglInit===void 0)return;let I=b.source,W=f.get(I);if(W){let ne=W[_.__cacheKey];if(ne.usedTimes--,ne.usedTimes===0)H(b);if(Object.keys(W).length===0)f.delete(I)}i.remove(b)}function H(b){let _=i.get(b);e.deleteTexture(_.__webglTexture);let I=b.source,W=f.get(I);delete W[_.__cacheKey],o.memory.textures--}function U(b){let _=i.get(b);if(b.depthTexture)b.depthTexture.dispose(),i.remove(b.depthTexture);if(b.isWebGLCubeRenderTarget)for(let W=0;W<6;W++){if(Array.isArray(_.__webglFramebuffer[W]))for(let ne=0;ne<_.__webglFramebuffer[W].length;ne++)e.deleteFramebuffer(_.__webglFramebuffer[W][ne]);else e.deleteFramebuffer(_.__webglFramebuffer[W]);if(_.__webglDepthbuffer)e.deleteRenderbuffer(_.__webglDepthbuffer[W])}else{if(Array.isArray(_.__webglFramebuffer))for(let W=0;W<_.__webglFramebuffer.length;W++)e.deleteFramebuffer(_.__webglFramebuffer[W]);else e.deleteFramebuffer(_.__webglFramebuffer);if(_.__webglDepthbuffer)e.deleteRenderbuffer(_.__webglDepthbuffer);if(_.__webglMultisampledFramebuffer)e.deleteFramebuffer(_.__webglMultisampledFramebuffer);if(_.__webglColorRenderbuffer){for(let W=0;W<_.__webglColorRenderbuffer.length;W++)if(_.__webglColorRenderbuffer[W])e.deleteRenderbuffer(_.__webglColorRenderbuffer[W])}if(_.__webglDepthRenderbuffer)e.deleteRenderbuffer(_.__webglDepthRenderbuffer)}let I=b.textures;for(let W=0,ne=I.length;W<ne;W++){let ae=i.get(I[W]);if(ae.__webglTexture)e.deleteTexture(ae.__webglTexture),o.memory.textures--;i.remove(I[W])}i.remove(b)}let z=0;function N(){z=0}function C(){return z}function F(b){z=b}function V(){let b=z;if(b>=r.maxTextures)Te("WebGLTextures: Trying to use "+(b+1)+" texture units while this GPU supports only "+r.maxTextures);return z+=1,b}function G(b){let _=[];return _.push(b.wrapS),_.push(b.wrapT),_.push(b.wrapR||0),_.push(b.magFilter),_.push(b.minFilter),_.push(b.anisotropy),_.push(b.internalFormat),_.push(b.format),_.push(b.type),_.push(b.generateMipmaps),_.push(b.premultiplyAlpha),_.push(b.flipY),_.push(b.unpackAlignment),_.push(b.colorSpace),_.join()}function ie(b,_){let I=i.get(b);if(b.isVideoTexture)Jt(b);if(b.isRenderTargetTexture===!1&&b.isExternalTexture!==!0&&b.version>0&&I.__version!==b.version){let W=b.image;if(W===null)Te("WebGLRenderer: Texture marked for update but no image data found.");else if(W.complete===!1)Te("WebGLRenderer: Texture marked for update but image is incomplete");else{Pe(I,b,_);return}}else if(b.isExternalTexture)I.__webglTexture=b.sourceTexture?b.sourceTexture:null;n.bindTexture(e.TEXTURE_2D,I.__webglTexture,e.TEXTURE0+_)}function X(b,_){let I=i.get(b);if(b.isRenderTargetTexture===!1&&b.version>0&&I.__version!==b.version){Pe(I,b,_);return}else if(b.isExternalTexture)I.__webglTexture=b.sourceTexture?b.sourceTexture:null;n.bindTexture(e.TEXTURE_2D_ARRAY,I.__webglTexture,e.TEXTURE0+_)}function Q(b,_){let I=i.get(b);if(b.isRenderTargetTexture===!1&&b.version>0&&I.__version!==b.version){Pe(I,b,_);return}n.bindTexture(e.TEXTURE_3D,I.__webglTexture,e.TEXTURE0+_)}function ee(b,_){let I=i.get(b);if(b.isCubeDepthTexture!==!0&&b.version>0&&I.__version!==b.version){Ne(I,b,_);return}n.bindTexture(e.TEXTURE_CUBE_MAP,I.__webglTexture,e.TEXTURE0+_)}let ve={[Cr]:e.REPEAT,[Ir]:e.CLAMP_TO_EDGE,[Oo]:e.MIRRORED_REPEAT},Ee={[Tn]:e.NEAREST,[Fo]:e.NEAREST_MIPMAP_NEAREST,[$i]:e.NEAREST_MIPMAP_LINEAR,[zt]:e.LINEAR,[Pr]:e.LINEAR_MIPMAP_NEAREST,[Un]:e.LINEAR_MIPMAP_LINEAR},qe={[zm]:e.NEVER,[Vm]:e.ALWAYS,[km]:e.LESS,[$o]:e.LEQUAL,[Bm]:e.EQUAL,[Zo]:e.GEQUAL,[Gm]:e.GREATER,[Hm]:e.NOTEQUAL};function ke(b,_){if(_.type===si&&t.has("OES_texture_float_linear")===!1&&(_.magFilter===zt||_.magFilter===Pr||_.magFilter===$i||_.magFilter===Un||_.minFilter===zt||_.minFilter===Pr||_.minFilter===$i||_.minFilter===Un))Te("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.");if(e.texParameteri(b,e.TEXTURE_WRAP_S,ve[_.wrapS]),e.texParameteri(b,e.TEXTURE_WRAP_T,ve[_.wrapT]),b===e.TEXTURE_3D||b===e.TEXTURE_2D_ARRAY)e.texParameteri(b,e.TEXTURE_WRAP_R,ve[_.wrapR]);if(e.texParameteri(b,e.TEXTURE_MAG_FILTER,Ee[_.magFilter]),e.texParameteri(b,e.TEXTURE_MIN_FILTER,Ee[_.minFilter]),_.compareFunction)e.texParameteri(b,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(b,e.TEXTURE_COMPARE_FUNC,qe[_.compareFunction]);if(t.has("EXT_texture_filter_anisotropic")===!0){if(_.magFilter===Tn)return;if(_.minFilter!==$i&&_.minFilter!==Un)return;if(_.type===si&&t.has("OES_texture_float_linear")===!1)return;if(_.anisotropy>1||i.get(_).__currentAnisotropy){let I=t.get("EXT_texture_filter_anisotropic");e.texParameterf(b,I.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(_.anisotropy,r.getMaxAnisotropy())),i.get(_).__currentAnisotropy=_.anisotropy}}}function q(b,_){let I=!1;if(b.__webglInit===void 0)b.__webglInit=!0,_.addEventListener("dispose",R);let W=_.source,ne=f.get(W);if(ne===void 0)ne={},f.set(W,ne);let ae=G(_);if(ae!==b.__cacheKey){if(ne[ae]===void 0)ne[ae]={texture:e.createTexture(),usedTimes:0},o.memory.textures++,I=!0;ne[ae].usedTimes++;let ue=ne[b.__cacheKey];if(ue!==void 0){if(ne[b.__cacheKey].usedTimes--,ue.usedTimes===0)H(_)}b.__cacheKey=ae,b.__webglTexture=ne[ae].texture}return I}function re(b,_,I){return Math.floor(Math.floor(b/I)/_)}function se(b,_,I,W){let ae=b.updateRanges;if(ae.length===0)n.texSubImage2D(e.TEXTURE_2D,0,0,0,_.width,_.height,I,W,_.data);else{ae.sort((we,he)=>we.start-he.start);let ue=0;for(let we=1;we<ae.length;we++){let he=ae[ue],oe=ae[we],Ce=he.start+he.count,Le=re(oe.start,_.width,4),je=re(he.start,_.width,4);if(oe.start<=Ce+1&&Le===je&&re(oe.start+oe.count-1,_.width,4)===Le)he.count=Math.max(he.count,oe.start+oe.count-he.start);else++ue,ae[ue]=oe}ae.length=ue+1;let Y=n.getParameter(e.UNPACK_ROW_LENGTH),j=n.getParameter(e.UNPACK_SKIP_PIXELS),ge=n.getParameter(e.UNPACK_SKIP_ROWS);n.pixelStorei(e.UNPACK_ROW_LENGTH,_.width);for(let we=0,he=ae.length;we<he;we++){let oe=ae[we],Ce=Math.floor(oe.start/4),Le=Math.ceil(oe.count/4),je=Ce%_.width,D=Math.floor(Ce/_.width),ce=Le,J=1;n.pixelStorei(e.UNPACK_SKIP_PIXELS,je),n.pixelStorei(e.UNPACK_SKIP_ROWS,D),n.texSubImage2D(e.TEXTURE_2D,0,je,D,ce,1,I,W,_.data)}b.clearUpdateRanges(),n.pixelStorei(e.UNPACK_ROW_LENGTH,Y),n.pixelStorei(e.UNPACK_SKIP_PIXELS,j),n.pixelStorei(e.UNPACK_SKIP_ROWS,ge)}}function Pe(b,_,I){let W=e.TEXTURE_2D;if(_.isDataArrayTexture||_.isCompressedArrayTexture)W=e.TEXTURE_2D_ARRAY;if(_.isData3DTexture)W=e.TEXTURE_3D;let ne=q(b,_),ae=_.source;n.bindTexture(W,b.__webglTexture,e.TEXTURE0+I);let ue=i.get(ae);if(ae.version!==ue.__version||ne===!0){if(n.activeTexture(e.TEXTURE0+I),(typeof ImageBitmap<"u"&&_.image instanceof ImageBitmap)===!1){let J=He.getPrimaries(He.workingColorSpace),le=_.colorSpace===Yi?null:He.getPrimaries(_.colorSpace),_e=_.colorSpace===Yi||J===le?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,_.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,_e)}n.pixelStorei(e.UNPACK_ALIGNMENT,_.unpackAlignment);let j=p(_.image,!1,r.maxTextureSize);j=et(_,j);let ge=s.convert(_.format,_.colorSpace),we=s.convert(_.type),he=v(_.internalFormat,ge,we,_.normalized,_.colorSpace,_.isVideoTexture);ke(W,_);let oe,Ce=_.mipmaps,Le=_.isVideoTexture!==!0,je=ue.__version===void 0||ne===!0,D=ae.dataReady,ce=E(_,j);if(_.isDepthTexture){if(he=w(_.format===Xi,_.type),je)if(Le)n.texStorage2D(e.TEXTURE_2D,1,he,j.width,j.height);else n.texImage2D(e.TEXTURE_2D,0,he,j.width,j.height,0,ge,we,null)}else if(_.isDataTexture)if(Ce.length>0){if(Le&&je)n.texStorage2D(e.TEXTURE_2D,ce,he,Ce[0].width,Ce[0].height);for(let J=0,le=Ce.length;J<le;J++)if(oe=Ce[J],Le){if(D)n.texSubImage2D(e.TEXTURE_2D,J,0,0,oe.width,oe.height,ge,we,oe.data)}else n.texImage2D(e.TEXTURE_2D,J,he,oe.width,oe.height,0,ge,we,oe.data);_.generateMipmaps=!1}else if(Le){if(je)n.texStorage2D(e.TEXTURE_2D,ce,he,j.width,j.height);if(D)se(_,j,ge,we)}else n.texImage2D(e.TEXTURE_2D,0,he,j.width,j.height,0,ge,we,j.data);else if(_.isCompressedTexture)if(_.isCompressedArrayTexture){if(Le&&je)n.texStorage3D(e.TEXTURE_2D_ARRAY,ce,he,Ce[0].width,Ce[0].height,j.depth);for(let J=0,le=Ce.length;J<le;J++)if(oe=Ce[J],_.format!==Fn)if(ge!==null)if(Le){if(D)if(_.layerUpdates.size>0){let _e=Vl(oe.width,oe.height,_.format,_.type);for(let te of _.layerUpdates){let fe=oe.data.subarray(te*_e/oe.data.BYTES_PER_ELEMENT,(te+1)*_e/oe.data.BYTES_PER_ELEMENT);n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,J,0,0,te,oe.width,oe.height,1,ge,fe)}}else n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,J,0,0,0,oe.width,oe.height,j.depth,ge,oe.data)}else n.compressedTexImage3D(e.TEXTURE_2D_ARRAY,J,he,oe.width,oe.height,j.depth,0,oe.data,0,0);else Te("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else if(Le){if(D)n.texSubImage3D(e.TEXTURE_2D_ARRAY,J,0,0,0,oe.width,oe.height,j.depth,ge,we,oe.data)}else n.texImage3D(e.TEXTURE_2D_ARRAY,J,he,oe.width,oe.height,j.depth,0,ge,we,oe.data);if(_.layerUpdates.size>0)_.clearLayerUpdates()}else{if(Le&&je)n.texStorage2D(e.TEXTURE_2D,ce,he,Ce[0].width,Ce[0].height);for(let J=0,le=Ce.length;J<le;J++)if(oe=Ce[J],_.format!==Fn)if(ge!==null)if(Le){if(D)n.compressedTexSubImage2D(e.TEXTURE_2D,J,0,0,oe.width,oe.height,ge,oe.data)}else n.compressedTexImage2D(e.TEXTURE_2D,J,he,oe.width,oe.height,0,oe.data);else Te("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else if(Le){if(D)n.texSubImage2D(e.TEXTURE_2D,J,0,0,oe.width,oe.height,ge,we,oe.data)}else n.texImage2D(e.TEXTURE_2D,J,he,oe.width,oe.height,0,ge,we,oe.data)}else if(_.isDataArrayTexture)if(Le){if(je)n.texStorage3D(e.TEXTURE_2D_ARRAY,ce,he,j.width,j.height,j.depth);if(D)if(_.layerUpdates.size>0){let J=Vl(j.width,j.height,_.format,_.type);for(let le of _.layerUpdates){let _e=j.data.subarray(le*J/j.data.BYTES_PER_ELEMENT,(le+1)*J/j.data.BYTES_PER_ELEMENT);n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,le,j.width,j.height,1,ge,we,_e)}_.clearLayerUpdates()}else n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,j.width,j.height,j.depth,ge,we,j.data)}else n.texImage3D(e.TEXTURE_2D_ARRAY,0,he,j.width,j.height,j.depth,0,ge,we,j.data);else if(_.isData3DTexture)if(Le){if(je)n.texStorage3D(e.TEXTURE_3D,ce,he,j.width,j.height,j.depth);if(D)n.texSubImage3D(e.TEXTURE_3D,0,0,0,0,j.width,j.height,j.depth,ge,we,j.data)}else n.texImage3D(e.TEXTURE_3D,0,he,j.width,j.height,j.depth,0,ge,we,j.data);else if(_.isFramebufferTexture){if(je)if(Le)n.texStorage2D(e.TEXTURE_2D,ce,he,j.width,j.height);else{let J=j.width,le=j.height;for(let _e=0;_e<ce;_e++)n.texImage2D(e.TEXTURE_2D,_e,he,J,le,0,ge,we,null),J>>=1,le>>=1}}else if(_.isHTMLTexture){if("texElementImage2D"in e){let J=e.canvas;if(!J.hasAttribute("layoutsubtree"))J.setAttribute("layoutsubtree","true");if(j.parentNode!==J){J.appendChild(j),d.add(_),J.onpaint=(le)=>{let _e=le.changedElements;for(let te of d)if(_e.includes(te.image))te.needsUpdate=!0},J.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,j);else{let{RGBA:_e,RGBA:te,UNSIGNED_BYTE:fe}=e;e.texElementImage2D(e.TEXTURE_2D,0,_e,te,fe,j)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(Ce.length>0){if(Le&&je){let J=_t(Ce[0]);n.texStorage2D(e.TEXTURE_2D,ce,he,J.width,J.height)}for(let J=0,le=Ce.length;J<le;J++)if(oe=Ce[J],Le){if(D)n.texSubImage2D(e.TEXTURE_2D,J,0,0,ge,we,oe)}else n.texImage2D(e.TEXTURE_2D,J,he,ge,we,oe);_.generateMipmaps=!1}else if(Le){if(je){let J=_t(j);n.texStorage2D(e.TEXTURE_2D,ce,he,J.width,J.height)}if(D)n.texSubImage2D(e.TEXTURE_2D,0,0,0,ge,we,j)}else n.texImage2D(e.TEXTURE_2D,0,he,ge,we,j);if(m(_))T(W);if(ue.__version=ae.version,_.onUpdate)_.onUpdate(_)}b.__version=_.version}function Ne(b,_,I){if(_.image.length!==6)return;let W=q(b,_),ne=_.source;n.bindTexture(e.TEXTURE_CUBE_MAP,b.__webglTexture,e.TEXTURE0+I);let ae=i.get(ne);if(ne.version!==ae.__version||W===!0){n.activeTexture(e.TEXTURE0+I);let ue=He.getPrimaries(He.workingColorSpace),Y=_.colorSpace===Yi?null:He.getPrimaries(_.colorSpace),j=_.colorSpace===Yi||ue===Y?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,_.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),n.pixelStorei(e.UNPACK_ALIGNMENT,_.unpackAlignment),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,j);let ge=_.isCompressedTexture||_.image[0].isCompressedTexture,we=_.image[0]&&_.image[0].isDataTexture,he=[];for(let te=0;te<6;te++){if(!ge&&!we)he[te]=p(_.image[te],!0,r.maxCubemapSize);else he[te]=we?_.image[te].image:_.image[te];he[te]=et(_,he[te])}let oe=he[0],Ce=s.convert(_.format,_.colorSpace),Le=s.convert(_.type),je=v(_.internalFormat,Ce,Le,_.normalized,_.colorSpace),D=_.isVideoTexture!==!0,ce=ae.__version===void 0||W===!0,J=ne.dataReady,le=E(_,oe);ke(e.TEXTURE_CUBE_MAP,_);let _e;if(ge){if(D&&ce)n.texStorage2D(e.TEXTURE_CUBE_MAP,le,je,oe.width,oe.height);for(let te=0;te<6;te++){_e=he[te].mipmaps;for(let fe=0;fe<_e.length;fe++){let Fe=_e[fe];if(_.format!==Fn)if(Ce!==null)if(D){if(J)n.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe,0,0,Fe.width,Fe.height,Ce,Fe.data)}else n.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe,je,Fe.width,Fe.height,0,Fe.data);else Te("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()");else if(D){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe,0,0,Fe.width,Fe.height,Ce,Le,Fe.data)}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe,je,Fe.width,Fe.height,0,Ce,Le,Fe.data)}}}else{if(_e=_.mipmaps,D&&ce){if(_e.length>0)le++;let te=_t(he[0]);n.texStorage2D(e.TEXTURE_CUBE_MAP,le,je,te.width,te.height)}for(let te=0;te<6;te++)if(we){if(D){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,he[te].width,he[te].height,Ce,Le,he[te].data)}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,je,he[te].width,he[te].height,0,Ce,Le,he[te].data);for(let fe=0;fe<_e.length;fe++){let ut=_e[fe].image[te].image;if(D){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe+1,0,0,ut.width,ut.height,Ce,Le,ut.data)}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe+1,je,ut.width,ut.height,0,Ce,Le,ut.data)}}else{if(D){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,Ce,Le,he[te])}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,je,Ce,Le,he[te]);for(let fe=0;fe<_e.length;fe++){let Fe=_e[fe];if(D){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe+1,0,0,Ce,Le,Fe.image[te])}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe+1,je,Ce,Le,Fe.image[te])}}}if(m(_))T(e.TEXTURE_CUBE_MAP);if(ae.__version=ne.version,_.onUpdate)_.onUpdate(_)}b.__version=_.version}function Re(b,_,I,W,ne,ae){let ue=s.convert(I.format,I.colorSpace),Y=s.convert(I.type),j=v(I.internalFormat,ue,Y,I.normalized,I.colorSpace),ge=i.get(_),we=i.get(I);if(we.__renderTarget=_,!ge.__hasExternalTextures){let he=Math.max(1,_.width>>ae),oe=Math.max(1,_.height>>ae);if(ne===e.TEXTURE_3D||ne===e.TEXTURE_2D_ARRAY)n.texImage3D(ne,ae,j,he,oe,_.depth,0,ue,Y,null);else n.texImage2D(ne,ae,j,he,oe,0,ue,Y,null)}if(n.bindFramebuffer(e.FRAMEBUFFER,b),P(_))a.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,W,ne,we.__webglTexture,0,Pt(_));else if(ne===e.TEXTURE_2D||ne>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&ne<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)e.framebufferTexture2D(e.FRAMEBUFFER,W,ne,we.__webglTexture,ae);n.bindFramebuffer(e.FRAMEBUFFER,null)}function Ct(b,_,I){if(e.bindRenderbuffer(e.RENDERBUFFER,b),_.depthBuffer){let W=_.depthTexture,ne=W&&W.isDepthTexture?W.type:null,ae=w(_.stencilBuffer,ne),ue=_.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(P(_))a.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Pt(_),ae,_.width,_.height);else if(I)e.renderbufferStorageMultisample(e.RENDERBUFFER,Pt(_),ae,_.width,_.height);else e.renderbufferStorage(e.RENDERBUFFER,ae,_.width,_.height);e.framebufferRenderbuffer(e.FRAMEBUFFER,ue,e.RENDERBUFFER,b)}else{let W=_.textures;for(let ne=0;ne<W.length;ne++){let ae=W[ne],ue=s.convert(ae.format,ae.colorSpace),Y=s.convert(ae.type),j=v(ae.internalFormat,ue,Y,ae.normalized,ae.colorSpace);if(P(_))a.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Pt(_),j,_.width,_.height);else if(I)e.renderbufferStorageMultisample(e.RENDERBUFFER,Pt(_),j,_.width,_.height);else e.renderbufferStorage(e.RENDERBUFFER,j,_.width,_.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function Ze(b,_,I){let W=_.isWebGLCubeRenderTarget===!0;if(n.bindFramebuffer(e.FRAMEBUFFER,b),!(_.depthTexture&&_.depthTexture.isDepthTexture))throw Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let ne=i.get(_.depthTexture);if(ne.__renderTarget=_,!ne.__webglTexture||_.depthTexture.image.width!==_.width||_.depthTexture.image.height!==_.height)_.depthTexture.image.width=_.width,_.depthTexture.image.height=_.height,_.depthTexture.needsUpdate=!0;if(W){if(ne.__webglInit===void 0)ne.__webglInit=!0,_.depthTexture.addEventListener("dispose",R);if(ne.__webglTexture===void 0){ne.__webglTexture=e.createTexture(),n.bindTexture(e.TEXTURE_CUBE_MAP,ne.__webglTexture),ke(e.TEXTURE_CUBE_MAP,_.depthTexture);let ge=s.convert(_.depthTexture.format),we=s.convert(_.depthTexture.type),he;if(_.depthTexture.format===Zi)he=e.DEPTH_COMPONENT24;else if(_.depthTexture.format===Xi)he=e.DEPTH24_STENCIL8;for(let oe=0;oe<6;oe++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,he,_.width,_.height,0,ge,we,null)}}else ie(_.depthTexture,0);let ae=ne.__webglTexture,ue=Pt(_),Y=W?e.TEXTURE_CUBE_MAP_POSITIVE_X+I:e.TEXTURE_2D,j=_.depthTexture.format===Xi?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(_.depthTexture.format===Zi)if(P(_))a.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,j,Y,ae,0,ue);else e.framebufferTexture2D(e.FRAMEBUFFER,j,Y,ae,0);else if(_.depthTexture.format===Xi)if(P(_))a.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,j,Y,ae,0,ue);else e.framebufferTexture2D(e.FRAMEBUFFER,j,Y,ae,0);else throw Error("THREE.WebGLTextures: Unknown depthTexture format.")}function Ye(b){let _=i.get(b),I=b.isWebGLCubeRenderTarget===!0;if(_.__boundDepthTexture!==b.depthTexture){let W=b.depthTexture;if(_.__depthDisposeCallback)_.__depthDisposeCallback();if(W){let ne=()=>{delete _.__boundDepthTexture,delete _.__depthDisposeCallback,W.removeEventListener("dispose",ne)};W.addEventListener("dispose",ne),_.__depthDisposeCallback=ne}_.__boundDepthTexture=W}if(b.depthTexture&&!_.__autoAllocateDepthBuffer)if(I)for(let W=0;W<6;W++)Ze(_.__webglFramebuffer[W],b,W);else{let W=b.texture.mipmaps;if(W&&W.length>0)Ze(_.__webglFramebuffer[0],b,0);else Ze(_.__webglFramebuffer,b,0)}else if(I){_.__webglDepthbuffer=[];for(let W=0;W<6;W++)if(n.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer[W]),_.__webglDepthbuffer[W]===void 0)_.__webglDepthbuffer[W]=e.createRenderbuffer(),Ct(_.__webglDepthbuffer[W],b,!1);else{let ne=b.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ae=_.__webglDepthbuffer[W];e.bindRenderbuffer(e.RENDERBUFFER,ae),e.framebufferRenderbuffer(e.FRAMEBUFFER,ne,e.RENDERBUFFER,ae)}}else{let W=b.texture.mipmaps;if(W&&W.length>0)n.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer[0]);else n.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer);if(_.__webglDepthbuffer===void 0)_.__webglDepthbuffer=e.createRenderbuffer(),Ct(_.__webglDepthbuffer,b,!1);else{let ne=b.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ae=_.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,ae),e.framebufferRenderbuffer(e.FRAMEBUFFER,ne,e.RENDERBUFFER,ae)}}n.bindFramebuffer(e.FRAMEBUFFER,null)}function it(b,_,I){let W=i.get(b);if(_!==void 0)Re(W.__webglFramebuffer,b,b.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0);if(I!==void 0)Ye(b)}function Je(b){let _=b.texture,I=i.get(b),W=i.get(_);b.addEventListener("dispose",x);let ne=b.textures,ae=b.isWebGLCubeRenderTarget===!0,ue=ne.length>1;if(!ue){if(W.__webglTexture===void 0)W.__webglTexture=e.createTexture();W.__version=_.version,o.memory.textures++}if(ae){I.__webglFramebuffer=[];for(let Y=0;Y<6;Y++)if(_.mipmaps&&_.mipmaps.length>0){I.__webglFramebuffer[Y]=[];for(let j=0;j<_.mipmaps.length;j++)I.__webglFramebuffer[Y][j]=e.createFramebuffer()}else I.__webglFramebuffer[Y]=e.createFramebuffer()}else{if(_.mipmaps&&_.mipmaps.length>0){I.__webglFramebuffer=[];for(let Y=0;Y<_.mipmaps.length;Y++)I.__webglFramebuffer[Y]=e.createFramebuffer()}else I.__webglFramebuffer=e.createFramebuffer();if(ue)for(let Y=0,j=ne.length;Y<j;Y++){let ge=i.get(ne[Y]);if(ge.__webglTexture===void 0)ge.__webglTexture=e.createTexture(),o.memory.textures++}if(b.samples>0&&P(b)===!1){I.__webglMultisampledFramebuffer=e.createFramebuffer(),I.__webglColorRenderbuffer=[],n.bindFramebuffer(e.FRAMEBUFFER,I.__webglMultisampledFramebuffer);for(let Y=0;Y<ne.length;Y++){let j=ne[Y];I.__webglColorRenderbuffer[Y]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,I.__webglColorRenderbuffer[Y]);let ge=s.convert(j.format,j.colorSpace),we=s.convert(j.type),he=v(j.internalFormat,ge,we,j.normalized,j.colorSpace,b.isXRRenderTarget===!0),oe=Pt(b);e.renderbufferStorageMultisample(e.RENDERBUFFER,oe,he,b.width,b.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+Y,e.RENDERBUFFER,I.__webglColorRenderbuffer[Y])}if(e.bindRenderbuffer(e.RENDERBUFFER,null),b.depthBuffer)I.__webglDepthRenderbuffer=e.createRenderbuffer(),Ct(I.__webglDepthRenderbuffer,b,!0);n.bindFramebuffer(e.FRAMEBUFFER,null)}}if(ae){n.bindTexture(e.TEXTURE_CUBE_MAP,W.__webglTexture),ke(e.TEXTURE_CUBE_MAP,_);for(let Y=0;Y<6;Y++)if(_.mipmaps&&_.mipmaps.length>0)for(let j=0;j<_.mipmaps.length;j++)Re(I.__webglFramebuffer[Y][j],b,_,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,j);else Re(I.__webglFramebuffer[Y],b,_,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0);if(m(_))T(e.TEXTURE_CUBE_MAP);n.unbindTexture()}else if(ue){for(let Y=0,j=ne.length;Y<j;Y++){let ge=ne[Y],we=i.get(ge),he=e.TEXTURE_2D;if(b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)he=b.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY;if(n.bindTexture(he,we.__webglTexture),ke(he,ge),Re(I.__webglFramebuffer,b,ge,e.COLOR_ATTACHMENT0+Y,he,0),m(ge))T(he)}n.unbindTexture()}else{let Y=e.TEXTURE_2D;if(b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)Y=b.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY;if(n.bindTexture(Y,W.__webglTexture),ke(Y,_),_.mipmaps&&_.mipmaps.length>0)for(let j=0;j<_.mipmaps.length;j++)Re(I.__webglFramebuffer[j],b,_,e.COLOR_ATTACHMENT0,Y,j);else Re(I.__webglFramebuffer,b,_,e.COLOR_ATTACHMENT0,Y,0);if(m(_))T(Y);n.unbindTexture()}if(b.depthBuffer)Ye(b)}function kt(b){let _=b.textures;for(let I=0,W=_.length;I<W;I++){let ne=_[I];if(m(ne)){let ae=A(b),ue=i.get(ne).__webglTexture;n.bindTexture(ae,ue),T(ae),n.unbindTexture()}}}let ft=[],Yt=[];function It(b){if(b.samples>0){if(P(b)===!1){let{textures:_,width:I,height:W}=b,ne=e.COLOR_BUFFER_BIT,ae=b.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ue=i.get(b),Y=_.length>1;if(Y)for(let ge=0;ge<_.length;ge++)n.bindFramebuffer(e.FRAMEBUFFER,ue.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+ge,e.RENDERBUFFER,null),n.bindFramebuffer(e.FRAMEBUFFER,ue.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+ge,e.TEXTURE_2D,null,0);n.bindFramebuffer(e.READ_FRAMEBUFFER,ue.__webglMultisampledFramebuffer);let j=b.texture.mipmaps;if(j&&j.length>0)n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ue.__webglFramebuffer[0]);else n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ue.__webglFramebuffer);for(let ge=0;ge<_.length;ge++){if(b.resolveDepthBuffer){if(b.depthBuffer)ne|=e.DEPTH_BUFFER_BIT;if(b.stencilBuffer&&b.resolveStencilBuffer)ne|=e.STENCIL_BUFFER_BIT}if(Y){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,ue.__webglColorRenderbuffer[ge]);let we=i.get(_[ge]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,we,0)}if(e.blitFramebuffer(0,0,I,W,0,0,I,W,ne,e.NEAREST),c===!0){if(ft.length=0,Yt.length=0,ft.push(e.COLOR_ATTACHMENT0+ge),b.depthBuffer&&b.storeMultisampledDepthBuffer===!1)ft.push(ae),Yt.push(ae),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,Yt);e.invalidateFramebuffer(e.READ_FRAMEBUFFER,ft)}}if(n.bindFramebuffer(e.READ_FRAMEBUFFER,null),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),Y)for(let ge=0;ge<_.length;ge++){n.bindFramebuffer(e.FRAMEBUFFER,ue.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+ge,e.RENDERBUFFER,ue.__webglColorRenderbuffer[ge]);let we=i.get(_[ge]).__webglTexture;n.bindFramebuffer(e.FRAMEBUFFER,ue.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+ge,e.TEXTURE_2D,we,0)}n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ue.__webglMultisampledFramebuffer)}else if(b.depthBuffer&&b.storeMultisampledDepthBuffer===!1&&c){let _=b.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[_])}}}function Pt(b){return Math.min(r.maxSamples,b.samples)}function P(b){let _=i.get(b);return b.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&_.__useRenderToTexture!==!1}function Jt(b){let _=o.render.frame;if(u.get(b)!==_)u.set(b,_),b.update()}function et(b,_){let{colorSpace:I,format:W,type:ne}=b;if(b.isCompressedTexture===!0||b.isVideoTexture===!0)return _;if(I!==nn&&I!==Yi)if(He.getTransfer(I)===lt){if(W!==Fn||ne!==En)Te("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.")}else De("WebGLTextures: Unsupported texture color space:",I);return _}function _t(b){if(typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement)l.width=b.naturalWidth||b.width,l.height=b.naturalHeight||b.height;else if(typeof VideoFrame<"u"&&b instanceof VideoFrame)l.width=b.displayWidth,l.height=b.displayHeight;else l.width=b.width,l.height=b.height;return l}this.allocateTextureUnit=V,this.resetTextureUnits=N,this.getTextureUnits=C,this.setTextureUnits=F,this.setTexture2D=ie,this.setTexture2DArray=X,this.setTexture3D=Q,this.setTextureCube=ee,this.rebindTextures=it,this.setupRenderTarget=Je,this.updateRenderTargetMipmap=kt,this.updateMultisampleRenderTarget=It,this.setupDepthRenderbuffer=Ye,this.setupFrameBufferTexture=Re,this.useMultisampledRTT=P,this.isReversedDepthBuffer=function(){return n.buffers.depth.getReversed()}}function IM(e,t){function n(i,r=Yi){let s,o=He.getTransfer(r);if(i===En)return e.UNSIGNED_BYTE;if(i===Uc)return e.UNSIGNED_SHORT_4_4_4_4;if(i===Oc)return e.UNSIGNED_SHORT_5_5_5_1;if(i===Lm)return e.UNSIGNED_INT_5_9_9_9_REV;if(i===Nm)return e.UNSIGNED_INT_10F_11F_11F_REV;if(i===Im)return e.BYTE;if(i===Pm)return e.SHORT;if(i===ds)return e.UNSIGNED_SHORT;if(i===Dc)return e.INT;if(i===Mi)return e.UNSIGNED_INT;if(i===si)return e.FLOAT;if(i===On)return e.HALF_FLOAT;if(i===Dm)return e.ALPHA;if(i===Um)return e.RGB;if(i===Fn)return e.RGBA;if(i===Zi)return e.DEPTH_COMPONENT;if(i===Xi)return e.DEPTH_STENCIL;if(i===Om)return e.RED;if(i===Fc)return e.RED_INTEGER;if(i===qi)return e.RG;if(i===zc)return e.RG_INTEGER;if(i===kc)return e.RGBA_INTEGER;if(i===zo||i===ko||i===Bo||i===Go)if(o===lt)if(s=t.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(i===zo)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===ko)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===Bo)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===Go)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=t.get("WEBGL_compressed_texture_s3tc"),s!==null){if(i===zo)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===ko)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===Bo)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===Go)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===Bc||i===Gc||i===Hc||i===Vc)if(s=t.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(i===Bc)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===Gc)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===Hc)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===Vc)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===Wc||i===$c||i===Zc||i===Xc||i===qc||i===Ho||i===Yc)if(s=t.get("WEBGL_compressed_texture_etc"),s!==null){if(i===Wc||i===$c)return o===lt?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(i===Zc)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC;if(i===Xc)return s.COMPRESSED_R11_EAC;if(i===qc)return s.COMPRESSED_SIGNED_R11_EAC;if(i===Ho)return s.COMPRESSED_RG11_EAC;if(i===Yc)return s.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===Jc||i===Kc||i===jc||i===Qc||i===el||i===tl||i===nl||i===il||i===rl||i===sl||i===ol||i===al||i===cl||i===ll)if(s=t.get("WEBGL_compressed_texture_astc"),s!==null){if(i===Jc)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===Kc)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===jc)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Qc)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===el)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===tl)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===nl)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===il)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===rl)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===sl)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===ol)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===al)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===cl)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===ll)return o===lt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===ul||i===hl||i===dl)if(s=t.get("EXT_texture_compression_bptc"),s!==null){if(i===ul)return o===lt?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===hl)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===dl)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===fl||i===pl||i===Vo||i===ml)if(s=t.get("EXT_texture_compression_rgtc"),s!==null){if(i===fl)return s.COMPRESSED_RED_RGTC1_EXT;if(i===pl)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===Vo)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===ml)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;if(i===Lr)return e.UNSIGNED_INT_24_8;return e[i]!==void 0?e[i]:null}return{convert:n}}var PM=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,LM=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class Ug{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new ta(e.texture);if(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)this.depthNear=e.depthNear,this.depthFar=e.depthFar;this.texture=n}}getMesh(e){if(this.texture!==null){if(this.mesh===null){let t=e.cameras[0].viewport,n=new _n({vertexShader:PM,fragmentShader:LM,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new vt(new ws(20,20),n)}}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class Og extends zn{constructor(e,t){super();let n=this,i=null,r=1,s=null,o="local-floor",a=1,c=null,l=null,u=null,d=null,h=null,f=null,g=typeof XRWebGLBinding<"u",S=new Ug,p={},m=t.getContextAttributes(),T=null,A=null,v=[],w=[],E=new ze,R=null,x=null,M=new Lt;M.viewport=new ot;let H=new Lt;H.viewport=new ot;let U=[M,H],z=new Fl,N=null,C=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(q){let re=v[q];if(re===void 0)re=new gs,v[q]=re;return re.getTargetRaySpace()},this.getControllerGrip=function(q){let re=v[q];if(re===void 0)re=new gs,v[q]=re;return re.getGripSpace()},this.getHand=function(q){let re=v[q];if(re===void 0)re=new gs,v[q]=re;return re.getHandSpace()};function F(q){let re=w.indexOf(q.inputSource);if(re===-1)return;let se=v[re];if(se!==void 0)se.update(q.inputSource,q.frame,c||s),se.dispatchEvent({type:q.type,data:q.inputSource})}function V(){i.removeEventListener("select",F),i.removeEventListener("selectstart",F),i.removeEventListener("selectend",F),i.removeEventListener("squeeze",F),i.removeEventListener("squeezestart",F),i.removeEventListener("squeezeend",F),i.removeEventListener("end",V),i.removeEventListener("inputsourceschange",G);for(let q=0;q<v.length;q++){let re=w[q];if(re===null)continue;w[q]=null,v[q].disconnect(re)}N=null,C=null,S.reset();for(let q in p)delete p[q];if(e.setRenderTarget(T),h=null,d=null,u=null,i=null,A=null,ke.stop(),n.isPresenting=!1,e.setPixelRatio(R),e.setSize(E.width,E.height,!1),x!==null){let q=x.camera;q.fov=x.fov,q.zoom=x.zoom,q.updateProjectionMatrix(),x=null}n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(q){if(r=q,n.isPresenting===!0)Te("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(q){if(o=q,n.isPresenting===!0)Te("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||s},this.setReferenceSpace=function(q){c=q},this.getBaseLayer=function(){return d!==null?d:h},this.getBinding=function(){if(u===null&&g)u=new XRWebGLBinding(i,t);return u},this.getFrame=function(){return f},this.getSession=function(){return i},this.setSession=async function(q){if(i=q,i!==null){if(T=e.getRenderTarget(),i.addEventListener("select",F),i.addEventListener("selectstart",F),i.addEventListener("selectend",F),i.addEventListener("squeeze",F),i.addEventListener("squeezestart",F),i.addEventListener("squeezeend",F),i.addEventListener("end",V),i.addEventListener("inputsourceschange",G),m.xrCompatible!==!0)await t.makeXRCompatible();if(R=e.getPixelRatio(),e.getSize(E),!(g&&("createProjectionLayer"in XRWebGLBinding.prototype))){let se={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:r};h=new XRWebGLLayer(i,t,se),i.updateRenderState({baseLayer:h}),e.setPixelRatio(1),e.setSize(h.framebufferWidth,h.framebufferHeight,!1),A=new rn(h.framebufferWidth,h.framebufferHeight,{format:Fn,type:En,colorSpace:e.outputColorSpace,stencilBuffer:m.stencil,resolveDepthBuffer:h.ignoreDepthValues===!1,resolveStencilBuffer:h.ignoreDepthValues===!1,storeMultisampledDepthBuffer:h.ignoreDepthValues===!1,storeMultisampledStencilBuffer:h.ignoreDepthValues===!1})}else{let se=null,Pe=null,Ne=null;if(m.depth)Ne=m.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,se=m.stencil?Xi:Zi,Pe=m.stencil?Lr:Mi;let Re={colorFormat:t.RGBA8,depthFormat:Ne,scaleFactor:r};u=this.getBinding(),d=u.createProjectionLayer(Re),i.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),A=new rn(d.textureWidth,d.textureHeight,{format:Fn,type:En,depthTexture:new Ki(d.textureWidth,d.textureHeight,Pe,void 0,void 0,void 0,void 0,void 0,void 0,se),stencilBuffer:m.stencil,colorSpace:e.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}A.isXRRenderTarget=!0,this.setFoveation(a),c=null,s=await i.requestReferenceSpace(o),ke.setContext(i),ke.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return S.getDepthTexture()};function G(q){for(let re=0;re<q.removed.length;re++){let se=q.removed[re],Pe=w.indexOf(se);if(Pe>=0)w[Pe]=null,v[Pe].disconnect(se)}for(let re=0;re<q.added.length;re++){let se=q.added[re],Pe=w.indexOf(se);if(Pe===-1){for(let Re=0;Re<v.length;Re++)if(Re>=w.length){w.push(se),Pe=Re;break}else if(w[Re]===null){w[Re]=se,Pe=Re;break}if(Pe===-1)break}let Ne=v[Pe];if(Ne)Ne.connect(se)}}let ie=new O,X=new O;function Q(q,re,se){ie.setFromMatrixPosition(re.matrixWorld),X.setFromMatrixPosition(se.matrixWorld);let Pe=ie.distanceTo(X),Ne=re.projectionMatrix.elements,Re=se.projectionMatrix.elements,Ct=Ne[14]/(Ne[10]-1),Ze=Ne[14]/(Ne[10]+1),Ye=(Ne[9]+1)/Ne[5],it=(Ne[9]-1)/Ne[5],Je=(Ne[8]-1)/Ne[0],kt=(Re[8]+1)/Re[0],ft=Ct*Je,Yt=Ct*kt,It=Pe/(-Je+kt),Pt=It*-Je;if(re.matrixWorld.decompose(q.position,q.quaternion,q.scale),q.translateX(Pt),q.translateZ(It),q.matrixWorld.compose(q.position,q.quaternion,q.scale),q.matrixWorldInverse.copy(q.matrixWorld).invert(),Ne[10]===-1)q.projectionMatrix.copy(re.projectionMatrix),q.projectionMatrixInverse.copy(re.projectionMatrixInverse);else{let P=Ct+It,Jt=Ze+It,et=ft-Pt,_t=Yt+(Pe-Pt),b=Ye*Ze/Jt*P,_=it*Ze/Jt*P;q.projectionMatrix.makePerspective(et,_t,b,_,P,Jt),q.projectionMatrixInverse.copy(q.projectionMatrix).invert()}}function ee(q,re){if(re===null)q.matrixWorld.copy(q.matrix);else q.matrixWorld.multiplyMatrices(re.matrixWorld,q.matrix);q.matrixWorldInverse.copy(q.matrixWorld).invert()}this.updateCamera=function(q){if(i===null)return;let{near:re,far:se}=q;if(S.texture!==null){if(S.depthNear>0)re=S.depthNear;if(S.depthFar>0)se=S.depthFar}if(z.near=H.near=M.near=re,z.far=H.far=M.far=se,N!==z.near||C!==z.far)i.updateRenderState({depthNear:z.near,depthFar:z.far}),N=z.near,C=z.far;z.layers.mask=q.layers.mask|6,M.layers.mask=z.layers.mask&-5,H.layers.mask=z.layers.mask&-3;let Pe=q.parent,Ne=z.cameras;ee(z,Pe);for(let Re=0;Re<Ne.length;Re++)ee(Ne[Re],Pe);if(Ne.length===2)Q(z,M,H);else z.projectionMatrix.copy(M.projectionMatrix);if(x===null&&q.isPerspectiveCamera)x={camera:q,fov:q.fov,zoom:q.zoom};ve(q,z,Pe)};function ve(q,re,se){if(se===null)q.matrix.copy(re.matrixWorld);else q.matrix.copy(se.matrixWorld),q.matrix.invert(),q.matrix.multiply(re.matrixWorld);if(q.matrix.decompose(q.position,q.quaternion,q.scale),q.updateMatrixWorld(!0),q.projectionMatrix.copy(re.projectionMatrix),q.projectionMatrixInverse.copy(re.projectionMatrixInverse),q.isPerspectiveCamera)q.fov=Vi*2*Math.atan(1/q.projectionMatrix.elements[5]),q.zoom=1}this.getCamera=function(){return z},this.getFoveation=function(){if(d===null&&h===null)return;return a},this.setFoveation=function(q){if(a=q,d!==null)d.fixedFoveation=q;if(h!==null&&h.fixedFoveation!==void 0)h.fixedFoveation=q},this.hasDepthSensing=function(){return S.texture!==null},this.getDepthSensingMesh=function(){return S.getMesh(z)},this.getCameraTexture=function(q){return p[q]};let Ee=null;function qe(q,re){if(l=re.getViewerPose(c||s),f=re,l!==null){let se=l.views;if(h!==null)e.setRenderTargetFramebuffer(A,h.framebuffer),e.setRenderTarget(A);let Pe=!1;if(se.length!==z.cameras.length)z.cameras.length=0,Pe=!0;for(let Ze=0;Ze<se.length;Ze++){let Ye=se[Ze],it=null;if(h!==null)it=h.getViewport(Ye);else{let kt=u.getViewSubImage(d,Ye);if(it=kt.viewport,Ze===0)e.setRenderTargetTextures(A,kt.colorTexture,kt.depthStencilTexture),e.setRenderTarget(A)}let Je=U[Ze];if(Je===void 0)Je=new Lt,Je.layers.enable(Ze),Je.viewport=new ot,U[Ze]=Je;if(Je.matrix.fromArray(Ye.transform.matrix),Je.matrix.decompose(Je.position,Je.quaternion,Je.scale),Je.projectionMatrix.fromArray(Ye.projectionMatrix),Je.projectionMatrixInverse.copy(Je.projectionMatrix).invert(),Je.viewport.set(it.x,it.y,it.width,it.height),Ze===0)z.matrix.copy(Je.matrix),z.matrix.decompose(z.position,z.quaternion,z.scale);if(Pe===!0)z.cameras.push(Je)}let Ne=i.enabledFeatures;if(Ne&&Ne.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&g){u=n.getBinding();let Ze=u.getDepthInformation(se[0]);if(Ze&&Ze.isValid&&Ze.texture)S.init(Ze,i.renderState)}if(Ne&&Ne.includes("camera-access")&&g){e.state.unbindTexture(),u=n.getBinding();for(let Ze=0;Ze<se.length;Ze++){let Ye=se[Ze].camera;if(Ye){let it=p[Ye];if(!it)it=new ta,p[Ye]=it;let Je=u.getCameraImage(Ye);it.sourceTexture=Je}}}}for(let se=0;se<v.length;se++){let Pe=w[se],Ne=v[se];if(Pe!==null&&Ne!==void 0)Ne.update(Pe,re,c||s)}if(Ee)Ee(q,re);if(re.detectedPlanes)n.dispatchEvent({type:"planesdetected",data:re});f=null}let ke=new wg;ke.setAnimationLoop(qe),this.setAnimationLoop=function(q){Ee=q},this.dispose=function(){}}}var NM=new Oe,Fg=new Ue;Fg.set(-1,0,0,0,1,0,0,0,1);function DM(e,t){function n(p,m){if(p.matrixAutoUpdate===!0)p.updateMatrix();m.value.copy(p.matrix)}function i(p,m){if(m.color.getRGB(p.fogColor.value,Rl(e)),m.isFog)p.fogNear.value=m.near,p.fogFar.value=m.far;else if(m.isFogExp2)p.fogDensity.value=m.density}function r(p,m,T,A,v){if(m.isNodeMaterial)m.uniformsNeedUpdate=!1;else if(m.isMeshBasicMaterial)s(p,m);else if(m.isMeshLambertMaterial){if(s(p,m),m.envMap)p.envMapIntensity.value=m.envMapIntensity}else if(m.isMeshToonMaterial)s(p,m),d(p,m);else if(m.isMeshPhongMaterial){if(s(p,m),u(p,m),m.envMap)p.envMapIntensity.value=m.envMapIntensity}else if(m.isMeshStandardMaterial){if(s(p,m),h(p,m),m.isMeshPhysicalMaterial)f(p,m,v)}else if(m.isMeshMatcapMaterial)s(p,m),g(p,m);else if(m.isMeshDepthMaterial)s(p,m);else if(m.isMeshDistanceMaterial)s(p,m),S(p,m);else if(m.isMeshNormalMaterial)s(p,m);else if(m.isLineBasicMaterial){if(o(p,m),m.isLineDashedMaterial)a(p,m)}else if(m.isPointsMaterial)c(p,m,T,A);else if(m.isSpriteMaterial)l(p,m);else if(m.isShadowMaterial)p.color.value.copy(m.color),p.opacity.value=m.opacity;else if(m.isShaderMaterial)m.uniformsNeedUpdate=!1}function s(p,m){if(p.opacity.value=m.opacity,m.color)p.diffuse.value.copy(m.color);if(m.emissive)p.emissive.value.copy(m.emissive).multiplyScalar(m.emissiveIntensity);if(m.map)p.map.value=m.map,n(m.map,p.mapTransform);if(m.alphaMap)p.alphaMap.value=m.alphaMap,n(m.alphaMap,p.alphaMapTransform);if(m.bumpMap){if(p.bumpMap.value=m.bumpMap,n(m.bumpMap,p.bumpMapTransform),p.bumpScale.value=m.bumpScale,m.side===jt)p.bumpScale.value*=-1}if(m.normalMap){if(p.normalMap.value=m.normalMap,n(m.normalMap,p.normalMapTransform),p.normalScale.value.copy(m.normalScale),m.side===jt)p.normalScale.value.negate()}if(m.displacementMap)p.displacementMap.value=m.displacementMap,n(m.displacementMap,p.displacementMapTransform),p.displacementScale.value=m.displacementScale,p.displacementBias.value=m.displacementBias;if(m.emissiveMap)p.emissiveMap.value=m.emissiveMap,n(m.emissiveMap,p.emissiveMapTransform);if(m.specularMap)p.specularMap.value=m.specularMap,n(m.specularMap,p.specularMapTransform);if(m.alphaTest>0)p.alphaTest.value=m.alphaTest;let T=t.get(m),{envMap:A,envMapRotation:v}=T;if(A){if(p.envMap.value=A,p.envMapRotation.value.setFromMatrix4(NM.makeRotationFromEuler(v)).transpose(),A.isCubeTexture&&A.isRenderTargetTexture===!1)p.envMapRotation.value.premultiply(Fg);p.reflectivity.value=m.reflectivity,p.ior.value=m.ior,p.refractionRatio.value=m.refractionRatio}if(m.lightMap)p.lightMap.value=m.lightMap,p.lightMapIntensity.value=m.lightMapIntensity,n(m.lightMap,p.lightMapTransform);if(m.aoMap)p.aoMap.value=m.aoMap,p.aoMapIntensity.value=m.aoMapIntensity,n(m.aoMap,p.aoMapTransform)}function o(p,m){if(p.diffuse.value.copy(m.color),p.opacity.value=m.opacity,m.map)p.map.value=m.map,n(m.map,p.mapTransform)}function a(p,m){p.dashSize.value=m.dashSize,p.totalSize.value=m.dashSize+m.gapSize,p.scale.value=m.scale}function c(p,m,T,A){if(p.diffuse.value.copy(m.color),p.opacity.value=m.opacity,p.size.value=m.size*T,p.scale.value=A*0.5,m.map)p.map.value=m.map,n(m.map,p.uvTransform);if(m.alphaMap)p.alphaMap.value=m.alphaMap,n(m.alphaMap,p.alphaMapTransform);if(m.alphaTest>0)p.alphaTest.value=m.alphaTest}function l(p,m){if(p.diffuse.value.copy(m.color),p.opacity.value=m.opacity,p.rotation.value=m.rotation,m.map)p.map.value=m.map,n(m.map,p.mapTransform);if(m.alphaMap)p.alphaMap.value=m.alphaMap,n(m.alphaMap,p.alphaMapTransform);if(m.alphaTest>0)p.alphaTest.value=m.alphaTest}function u(p,m){p.specular.value.copy(m.specular),p.shininess.value=Math.max(m.shininess,0.0001)}function d(p,m){if(m.gradientMap)p.gradientMap.value=m.gradientMap}function h(p,m){if(p.metalness.value=m.metalness,m.metalnessMap)p.metalnessMap.value=m.metalnessMap,n(m.metalnessMap,p.metalnessMapTransform);if(p.roughness.value=m.roughness,m.roughnessMap)p.roughnessMap.value=m.roughnessMap,n(m.roughnessMap,p.roughnessMapTransform);if(m.envMap)p.envMapIntensity.value=m.envMapIntensity}function f(p,m,T){if(p.ior.value=m.ior,m.sheen>0){if(p.sheenColor.value.copy(m.sheenColor).multiplyScalar(m.sheen),p.sheenRoughness.value=m.sheenRoughness,m.sheenColorMap)p.sheenColorMap.value=m.sheenColorMap,n(m.sheenColorMap,p.sheenColorMapTransform);if(m.sheenRoughnessMap)p.sheenRoughnessMap.value=m.sheenRoughnessMap,n(m.sheenRoughnessMap,p.sheenRoughnessMapTransform)}if(m.clearcoat>0){if(p.clearcoat.value=m.clearcoat,p.clearcoatRoughness.value=m.clearcoatRoughness,m.clearcoatMap)p.clearcoatMap.value=m.clearcoatMap,n(m.clearcoatMap,p.clearcoatMapTransform);if(m.clearcoatRoughnessMap)p.clearcoatRoughnessMap.value=m.clearcoatRoughnessMap,n(m.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform);if(m.clearcoatNormalMap){if(p.clearcoatNormalMap.value=m.clearcoatNormalMap,n(m.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(m.clearcoatNormalScale),m.side===jt)p.clearcoatNormalScale.value.negate()}}if(m.dispersion>0)p.dispersion.value=m.dispersion;if(m.retroreflectivity>0)p.retroreflectivity.value=m.retroreflectivity;if(m.iridescence>0){if(p.iridescence.value=m.iridescence,p.iridescenceIOR.value=m.iridescenceIOR,p.iridescenceThicknessMinimum.value=m.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=m.iridescenceThicknessRange[1],m.iridescenceMap)p.iridescenceMap.value=m.iridescenceMap,n(m.iridescenceMap,p.iridescenceMapTransform);if(m.iridescenceThicknessMap)p.iridescenceThicknessMap.value=m.iridescenceThicknessMap,n(m.iridescenceThicknessMap,p.iridescenceThicknessMapTransform)}if(m.transmission>0){if(p.transmission.value=m.transmission,p.transmissionSamplerMap.value=T.texture,p.transmissionSamplerSize.value.set(T.width,T.height),m.transmissionMap)p.transmissionMap.value=m.transmissionMap,n(m.transmissionMap,p.transmissionMapTransform);if(p.thickness.value=m.thickness,m.thicknessMap)p.thicknessMap.value=m.thicknessMap,n(m.thicknessMap,p.thicknessMapTransform);p.attenuationDistance.value=m.attenuationDistance,p.attenuationColor.value.copy(m.attenuationColor)}if(m.anisotropy>0){if(p.anisotropyVector.value.set(m.anisotropy*Math.cos(m.anisotropyRotation),m.anisotropy*Math.sin(m.anisotropyRotation)),m.anisotropyMap)p.anisotropyMap.value=m.anisotropyMap,n(m.anisotropyMap,p.anisotropyMapTransform)}if(p.specularIntensity.value=m.specularIntensity,p.specularColor.value.copy(m.specularColor),m.specularColorMap)p.specularColorMap.value=m.specularColorMap,n(m.specularColorMap,p.specularColorMapTransform);if(m.specularIntensityMap)p.specularIntensityMap.value=m.specularIntensityMap,n(m.specularIntensityMap,p.specularIntensityMapTransform)}function g(p,m){if(m.matcap)p.matcap.value=m.matcap}function S(p,m){let T=t.get(m).light;p.referencePosition.value.setFromMatrixPosition(T.matrixWorld),p.nearDistance.value=T.shadow.camera.near,p.farDistance.value=T.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:r}}function UM(e,t,n,i){let r={},s={},o=[],a=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(v,w){let E=w.program;i.uniformBlockBinding(v,E)}function l(v,w){let E=r[v.id];if(E===void 0)p(v),E=u(v),r[v.id]=E,v.addEventListener("dispose",T);let R=w.program;i.updateUBOMapping(v,R);let x=t.render.frame;if(s[v.id]!==x)h(v),s[v.id]=x}function u(v){let w=d();v.__bindingPointIndex=w;let E=e.createBuffer(),{__size:R,usage:x}=v;return e.bindBuffer(e.UNIFORM_BUFFER,E),e.bufferData(e.UNIFORM_BUFFER,R,x),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,w,E),E}function d(){for(let v=0;v<a;v++)if(o.indexOf(v)===-1)return o.push(v),v;return De("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function h(v){let w=r[v.id],{uniforms:E,__cache:R}=v;e.bindBuffer(e.UNIFORM_BUFFER,w);for(let x=0,M=E.length;x<M;x++){let H=E[x];if(Array.isArray(H))for(let U=0,z=H.length;U<z;U++)f(H[U],x,U,R);else f(H,x,0,R)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function f(v,w,E,R){if(S(v,w,E,R)===!0){let{__offset:x,value:M}=v;if(Array.isArray(M)){let H=0;for(let U=0;U<M.length;U++){let z=M[U],N=m(z);if(g(z,v.__data,H),typeof z!=="number"&&typeof z!=="boolean"&&!z.isMatrix3&&!ArrayBuffer.isView(z))H+=N.storage/Float32Array.BYTES_PER_ELEMENT}}else g(M,v.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,x,v.__data)}}function g(v,w,E){if(typeof v==="number"||typeof v==="boolean")w[0]=v;else if(v.isMatrix3)w[0]=v.elements[0],w[1]=v.elements[1],w[2]=v.elements[2],w[3]=0,w[4]=v.elements[3],w[5]=v.elements[4],w[6]=v.elements[5],w[7]=0,w[8]=v.elements[6],w[9]=v.elements[7],w[10]=v.elements[8],w[11]=0;else if(ArrayBuffer.isView(v))w.set(new v.constructor(v.buffer,v.byteOffset,w.length));else v.toArray(w,E)}function S(v,w,E,R){let x=v.value,M=w+"_"+E;if(R[M]===void 0){if(typeof x==="number"||typeof x==="boolean")R[M]=x;else if(ArrayBuffer.isView(x))R[M]=x.slice();else R[M]=x.clone();return!0}else{let H=R[M];if(typeof x==="number"||typeof x==="boolean"){if(H!==x)return R[M]=x,!0}else if(ArrayBuffer.isView(x))return!0;else if(H.equals(x)===!1)return H.copy(x),!0}return!1}function p(v){let w=v.uniforms,E=0,R=16;for(let M=0,H=w.length;M<H;M++){let U=Array.isArray(w[M])?w[M]:[w[M]];for(let z=0,N=U.length;z<N;z++){let C=U[z],F=Array.isArray(C.value)?C.value:[C.value];for(let V=0,G=F.length;V<G;V++){let ie=F[V],X=m(ie),Q=E%R,ee=Q%X.boundary,ve=Q+ee;if(E+=ee,ve!==0&&R-ve<X.storage)E+=R-ve;C.__data=new Float32Array(X.storage/Float32Array.BYTES_PER_ELEMENT),C.__offset=E,E+=X.storage}}}let x=E%R;if(x>0)E+=R-x;return v.__size=E,v.__cache={},this}function m(v){let w={boundary:0,storage:0};if(typeof v==="number"||typeof v==="boolean")w.boundary=4,w.storage=4;else if(v.isVector2)w.boundary=8,w.storage=8;else if(v.isVector3||v.isColor)w.boundary=16,w.storage=12;else if(v.isVector4)w.boundary=16,w.storage=16;else if(v.isMatrix3)w.boundary=48,w.storage=48;else if(v.isMatrix4)w.boundary=64,w.storage=64;else if(v.isTexture)Te("WebGLRenderer: Texture samplers can not be part of an uniforms group.");else if(ArrayBuffer.isView(v))w.boundary=16,w.storage=v.byteLength;else Te("WebGLRenderer: Unsupported uniform value type.",v);return w}function T(v){let w=v.target;w.removeEventListener("dispose",T);let E=o.indexOf(w.__bindingPointIndex);o.splice(E,1),e.deleteBuffer(r[w.id]),delete r[w.id],delete s[w.id]}function A(){for(let v in r)e.deleteBuffer(r[v]);o=[],r={},s={}}return{bind:c,update:l,dispose:A}}var OM=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),Vn=null;function FM(){if(Vn===null)Vn=new vs(OM,16,16,qi,On),Vn.name="DFG_LUT",Vn.minFilter=zt,Vn.magFilter=zt,Vn.wrapS=Ir,Vn.wrapT=Ir,Vn.generateMipmaps=!1,Vn.needsUpdate=!0;return Vn}class eu{constructor(e={}){let{canvas:t=Wm(),context:n=null,depth:i=!0,stencil:r=!1,alpha:s=!1,antialias:o=!1,premultipliedAlpha:a=!0,preserveDrawingBuffer:c=!1,powerPreference:l="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:d=!1,outputBufferType:h=En}=e;this.isWebGLRenderer=!0;let f;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");f=n.getContextAttributes().alpha}else f=s;let g=h,S=new Set([kc,zc,Fc]),p=new Set([En,Mi,ds,Lr,Uc,Oc]),m=new Uint32Array(4),T=new Int32Array(4),A=new O,v=null,w=null,E=[],R=[],x=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=wn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let M=this,H=!1,U=null,z=null,N=null,C=null;this._outputColorSpace=wi;let F=0,V=0,G=null,ie=-1,X=null,Q=new ot,ee=new ot,ve=null,Ee=new Ie(0),qe=0,{width:ke,height:q}=t,re=1,se=null,Pe=null,Ne=new ot(0,0,ke,q),Re=new ot(0,0,ke,q),Ct=!1,Ze=new Ss,Ye=!1,it=!1,Je=new Oe,kt=new O,ft=new ot,Yt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},It=!1;function Pt(){return G===null?re:1}let P=n;function Jt(y,L){return t.getContext(y,L)}let et,_t,b,_,I,W,ne,ae,ue,Y,j,ge,we,he,oe,Ce,Le,je,D,ce,J,le,_e;try{let y={alpha:!0,depth:i,stencil:r,antialias:o,premultipliedAlpha:a,preserveDrawingBuffer:c,powerPreference:l,failIfMajorPerformanceCaveat:u};if("setAttribute"in t)t.setAttribute("data-engine",`three.js r${Jp}`);if(t.addEventListener("webglcontextlost",Fe,!1),t.addEventListener("webglcontextrestored",ut,!1),t.addEventListener("webglcontextcreationerror",tt,!1),P===null){if(P=Jt("webgl2",y),P===null)if(Jt("webgl2"))throw Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.");else throw Error("THREE.WebGLRenderer: Error creating WebGL context.")}te()}catch(y){throw t.removeEventListener("webglcontextlost",Fe,!1),t.removeEventListener("webglcontextrestored",ut,!1),t.removeEventListener("webglcontextcreationerror",tt,!1),De("WebGLRenderer: "+y.message),y}function te(){if(et=new WS(P),et.init(),J=new IM(P,et),_t=new DS(P,et,e,J),b=new RM(P,et),_t.reversedDepthBuffer&&d)b.buffers.depth.setReversed(!0);z=P.createFramebuffer(),N=P.createFramebuffer(),C=P.createFramebuffer(),_=new XS(P),I=new pM,W=new CM(P,et,b,I,_t,J,_),ne=new VS(M),ae=new Yx(P),le=new LS(P,ae),ue=new $S(P,ae,_,le),Y=new YS(P,ue,ae,le,_),je=new qS(P,_t,W),oe=new US(I),j=new fM(M,ne,et,_t,le,oe),ge=new DM(M,I),we=new gM,he=new bM(et),Le=new PS(M,ne,b,Y,f,a),Ce=new AM(M,Y,_t),_e=new UM(P,_,_t,b),D=new NS(P,et,_),ce=new ZS(P,et,_),_.programs=j.programs,M.capabilities=_t,M.extensions=et,M.properties=I,M.renderLists=we,M.shadowMap=Ce,M.state=b,M.info=_}if(g!==En)x=new KS(g,t.width,t.height,o,i,r);let fe=new Og(M,P);this.xr=fe,this.getContext=function(){return P},this.getContextAttributes=function(){return P.getContextAttributes()},this.forceContextLoss=function(){let y=et.get("WEBGL_lose_context");if(y)y.loseContext()},this.forceContextRestore=function(){let y=et.get("WEBGL_lose_context");if(y)y.restoreContext()},this.getPixelRatio=function(){return re},this.setPixelRatio=function(y){if(y===void 0)return;re=y,this.setSize(ke,q,!1)},this.getSize=function(y){return y.set(ke,q)},this.setSize=function(y,L,Z=!0){if(fe.isPresenting){Te("WebGLRenderer: Can't change size while VR device is presenting.");return}if(ke=y,q=L,t.width=Math.floor(y*re),t.height=Math.floor(L*re),Z===!0)t.style.width=y+"px",t.style.height=L+"px";if(x!==null)x.setSize(t.width,t.height);this.setViewport(0,0,y,L)},this.getDrawingBufferSize=function(y){return y.set(ke*re,q*re).floor()},this.setDrawingBufferSize=function(y,L,Z){ke=y,q=L,re=Z,t.width=Math.floor(y*Z),t.height=Math.floor(L*Z),this.setViewport(0,0,y,L)},this.setEffects=function(y){if(g===En){De("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(y){for(let L=0;L<y.length;L++)if(y[L].isOutputPass===!0){Te("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}x.setEffects(y||[])},this.getCurrentViewport=function(y){return y.copy(Q)},this.getViewport=function(y){return y.copy(Ne)},this.setViewport=function(y,L,Z,k){if(y.isVector4)Ne.set(y.x,y.y,y.z,y.w);else Ne.set(y,L,Z,k);b.viewport(Q.copy(Ne).multiplyScalar(re).round())},this.getScissor=function(y){return y.copy(Re)},this.setScissor=function(y,L,Z,k){if(y.isVector4)Re.set(y.x,y.y,y.z,y.w);else Re.set(y,L,Z,k);b.scissor(ee.copy(Re).multiplyScalar(re).round())},this.getScissorTest=function(){return Ct},this.setScissorTest=function(y){b.setScissorTest(Ct=y)},this.setOpaqueSort=function(y){se=y},this.setTransparentSort=function(y){Pe=y},this.getClearColor=function(y){return y.copy(Le.getClearColor())},this.setClearColor=function(){Le.setClearColor(...arguments)},this.getClearAlpha=function(){return Le.getClearAlpha()},this.setClearAlpha=function(){Le.setClearAlpha(...arguments)},this.clear=function(y=!0,L=!0,Z=!0){let k=0;if(y){let B=!1;if(G!==null){let me=G.texture.format;B=S.has(me)}if(B){let me=G.texture.type,ye=p.has(me),pe=Le.getClearColor(),Se=Le.getClearAlpha(),{r:Me,g:Be,b:We}=pe;if(ye)m[0]=Me,m[1]=Be,m[2]=We,m[3]=Se,P.clearBufferuiv(P.COLOR,0,m);else T[0]=Me,T[1]=Be,T[2]=We,T[3]=Se,P.clearBufferiv(P.COLOR,0,T)}else k|=P.COLOR_BUFFER_BIT}if(L)k|=P.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0);if(Z)k|=P.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295);if(k!==0)P.clear(k)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(y){y.setRenderer(this),U=y},this.dispose=function(){t.removeEventListener("webglcontextlost",Fe,!1),t.removeEventListener("webglcontextrestored",ut,!1),t.removeEventListener("webglcontextcreationerror",tt,!1),Le.dispose(),we.dispose(),he.dispose(),I.dispose(),ne.dispose(),Y.dispose(),le.dispose(),_e.dispose(),j.dispose(),fe.dispose(),fe.removeEventListener("sessionstart",du),fe.removeEventListener("sessionend",fu),Li.stop()};function Fe(y){y.preventDefault(),cs("WebGLRenderer: Context Lost."),H=!0}function ut(){cs("WebGLRenderer: Context Restored."),H=!1;let y=_.autoReset,L=Ce.enabled,Z=Ce.autoUpdate,k=Ce.needsUpdate,B=Ce.type;te(),_.autoReset=y,Ce.enabled=L,Ce.autoUpdate=Z,Ce.needsUpdate=k,Ce.type=B}function tt(y){De("WebGLRenderer: A WebGL context could not be created. Reason: ",y.statusMessage)}function Rn(y){let L=y.target;L.removeEventListener("dispose",Rn),Zn(L)}function Zn(y){g_(y),I.remove(y)}function g_(y){let L=I.get(y).programs;if(L!==void 0){if(L.forEach(function(Z){j.releaseProgram(Z)}),y.isShaderMaterial)j.releaseShaderCache(y)}}this.renderBufferDirect=function(y,L,Z,k,B,me){if(L===null)L=Yt;let ye=B.isMesh&&B.matrixWorld.determinantAffine()<0,pe=v_(y,L,Z,k,B);b.setMaterial(k,ye);let Se=Z.index,Me=1;if(k.wireframe===!0){if(Se=ue.getWireframeAttribute(Z),Se===void 0)return;Me=2}let Be=Z.drawRange,We=Z.attributes.position,be=Be.start*Me,nt=(Be.start+Be.count)*Me;if(me!==null)be=Math.max(be,me.start*Me),nt=Math.min(nt,(me.start+me.count)*Me);if(Se!==null)be=Math.max(be,0),nt=Math.min(nt,Se.count);else if(We!==void 0&&We!==null)be=Math.max(be,0),nt=Math.min(nt,We.count);let At=nt-be;if(At<0||At===1/0)return;le.setup(B,k,pe,Z,Se);let pt,ct=D;if(Se!==null)pt=ae.get(Se),ct=ce,ct.setIndex(pt);if(B.isMesh)if(k.wireframe===!0)b.setLineWidth(k.wireframeLinewidth*Pt()),ct.setMode(P.LINES);else ct.setMode(P.TRIANGLES);else if(B.isLine){let Ht=k.linewidth;if(Ht===void 0)Ht=1;if(b.setLineWidth(Ht*Pt()),B.isLineSegments)ct.setMode(P.LINES);else if(B.isLineLoop)ct.setMode(P.LINE_LOOP);else ct.setMode(P.LINE_STRIP)}else if(B.isPoints)ct.setMode(P.POINTS);else if(B.isSprite)ct.setMode(P.TRIANGLES);if(B.isBatchedMesh)if(!et.get("WEBGL_multi_draw")){let{_multiDrawStarts:Ht,_multiDrawCounts:xe,_multiDrawCount:Zt}=B,Ke=Se?ae.get(Se).bytesPerElement:1,un=I.get(k).currentProgram.getUniforms();for(let Cn=0;Cn<Zt;Cn++)un.setValue(P,"_gl_DrawID",Cn),ct.render(Ht[Cn]/Ke,xe[Cn])}else ct.renderMultiDraw(B._multiDrawStarts,B._multiDrawCounts,B._multiDrawCount);else if(B.isInstancedMesh)ct.renderInstances(be,At,B.count);else if(Z.isInstancedBufferGeometry){let Ht=Z._maxInstanceCount!==void 0?Z._maxInstanceCount:1/0,xe=Math.min(Z.instanceCount,Ht);ct.renderInstances(be,At,xe)}else ct.render(be,At)};function hu(y,L,Z,k){if(U!==null&&y.isNodeMaterial)U.setObject(k,y);if(Ye===!0)oe.setState(y,Z,!1);if(y.transparent===!0&&y.side===pn&&y.forceSinglePass===!1)y.side=jt,y.needsUpdate=!0,Os(y,L,k),y.side=bi,y.needsUpdate=!0,Os(y,L,k),y.side=pn;else Os(y,L,k)}this.compile=function(y,L,Z=null){if(Z===null)Z=y;if(U!==null)U.renderStart(y,L,Z);if(w=he.get(Z),w.init(L),R.push(w),Z.traverseVisible(function(B){if(B.isLight&&B.layers.test(L.layers)){if(w.pushLight(B),B.castShadow)w.pushShadow(B)}}),y!==Z)y.traverseVisible(function(B){if(B.isLight&&B.layers.test(L.layers)){if(w.pushLight(B),B.castShadow)w.pushShadow(B)}});if(w.setupLights(),U!==null)U.updateLights(w.state.lightsArray);if(it=this.localClippingEnabled,Ye=oe.init(this.clippingPlanes,it),Ye===!0)oe.setGlobalState(this.clippingPlanes,L);if(U!==null)Ce.render(w.state.shadowsArray,Z,L);let k=new Set;if(y.traverse(function(B){if(!(B.isMesh||B.isPoints||B.isLine||B.isSprite))return;let me=B.material;if(me)if(Array.isArray(me))for(let ye=0;ye<me.length;ye++){let pe=me[ye];hu(pe,Z,L,B),k.add(pe)}else hu(me,Z,L,B),k.add(me)}),w=R.pop(),U!==null)U.renderEnd();return k},this.compileAsync=function(y,L,Z=null){let k=this.compile(y,L,Z);return new Promise((B)=>{function me(){if(k.forEach(function(ye){let Se=I.get(ye).currentProgram;if(Se===void 0||Se.isReady())k.delete(ye)}),k.size===0){B(y);return}setTimeout(me,10)}if(et.get("KHR_parallel_shader_compile")!==null)me();else setTimeout(me,10)})};let _a=null;function __(y){if(_a)_a(y)}function du(){Li.stop()}function fu(){Li.start()}let Li=new wg;if(Li.setAnimationLoop(__),typeof self<"u")Li.setContext(self);this.setAnimationLoop=function(y){_a=y,fe.setAnimationLoop(y),y===null?Li.stop():Li.start()},fe.addEventListener("sessionstart",du),fe.addEventListener("sessionend",fu),this.render=function(y,L){if(L!==void 0&&L.isCamera!==!0){De("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(H===!0)return;if(U!==null)U.renderStart(y,L);let Z=fe.enabled===!0&&fe.isPresenting===!0,k=x!==null&&(G===null||Z)&&x.begin(M,G);if(y.matrixWorldAutoUpdate===!0)y.updateMatrixWorld();if(L.parent===null&&L.matrixWorldAutoUpdate===!0)L.updateMatrixWorld();if(fe.enabled===!0&&fe.isPresenting===!0&&(x===null||x.isCompositing()===!1)){if(fe.cameraAutoUpdate===!0)fe.updateCamera(L);L=fe.getCamera()}if(y.isScene===!0)y.onBeforeRender(M,y,L,G);if(w=he.get(y,R.length),w.init(L),w.state.textureUnits=W.getTextureUnits(),R.push(w),Je.multiplyMatrices(L.projectionMatrix,L.matrixWorldInverse),Ze.setFromProjectionMatrix(Je,bl,L.reversedDepth),it=this.localClippingEnabled,Ye=oe.init(this.clippingPlanes,it),v=we.get(y,E.length),v.init(),E.push(v),fe.enabled===!0&&fe.isPresenting===!0){let ye=M.xr.getDepthSensingMesh();if(ye!==null)xa(ye,L,-1/0,M.sortObjects)}if(xa(y,L,0,M.sortObjects),v.finish(),U!==null)U.updateLights(w.state.lightsArray);if(M.sortObjects===!0)v.sort(se,Pe);if(It=fe.enabled===!1||fe.isPresenting===!1||fe.hasDepthSensing()===!1,It)Le.addToRenderList(v,y);if(this.info.render.frame++,this.info.autoReset===!0)this.info.reset();if(Ye===!0)oe.beginShadows();let B=w.state.shadowsArray;if(Ce.render(B,y,L),Ye===!0)oe.endShadows();if((k&&x.hasRenderPass())===!1){let ye=v.opaque,pe=v.transmissive;if(w.setupLights(),L.isArrayCamera){let Se=L.cameras;if(pe.length>0)for(let Me=0,Be=Se.length;Me<Be;Me++){let We=Se[Me];mu(ye,pe,y,We)}if(It)Le.render(y);for(let Me=0,Be=Se.length;Me<Be;Me++){let We=Se[Me];pu(v,y,We,We.viewport)}}else{if(pe.length>0)mu(ye,pe,y,L);if(It)Le.render(y);pu(v,y,L)}}if(G!==null&&V===0)W.updateMultisampleRenderTarget(G),W.updateRenderTargetMipmap(G);if(k)x.end(M);if(y.isScene===!0)y.onAfterRender(M,y,L);if(le.resetDefaultState(),ie=-1,X=null,R.pop(),R.length>0){if(w=R[R.length-1],W.setTextureUnits(w.state.textureUnits),Ye===!0)oe.setGlobalState(M.clippingPlanes,w.state.camera)}else w=null;if(E.pop(),E.length>0)v=E[E.length-1];else v=null;if(U!==null)U.renderEnd()};function xa(y,L,Z,k){if(y.visible===!1)return;if(y.layers.test(L.layers)){if(y.isGroup)Z=y.renderOrder;else if(y.isLOD){if(y.autoUpdate===!0)y.update(L)}else if(y.isLightProbeGrid)w.pushLightProbeGrid(y);else if(y.isLight){if(w.pushLight(y),y.castShadow)w.pushShadow(y)}else if(y.isSprite){if(!y.frustumCulled||y.intersectsFrustum(Ze)){if(k)ft.setFromMatrixPosition(y.matrixWorld).applyMatrix4(Je);let ye=Y.update(y),pe=y.material;if(pe.visible)v.push(y,ye,pe,Z,ft.z,null,L)}}else if(y.isMesh||y.isLine||y.isPoints){if(!y.frustumCulled||y.intersectsFrustum(Ze)){let ye=Y.update(y),pe=y.material;if(k){if(y.boundingSphere!==void 0){if(y.boundingSphere===null)y.computeBoundingSphere();ft.copy(y.boundingSphere.center)}else{if(ye.boundingSphere===null)ye.computeBoundingSphere();ft.copy(ye.boundingSphere.center)}ft.applyMatrix4(y.matrixWorld).applyMatrix4(Je)}if(Array.isArray(pe)){let Se=ye.groups;for(let Me=0,Be=Se.length;Me<Be;Me++){let We=Se[Me],be=pe[We.materialIndex];if(be&&be.visible)v.push(y,ye,be,Z,ft.z,We,L)}}else if(pe.visible)v.push(y,ye,pe,Z,ft.z,null,L)}}}let me=y.children;for(let ye=0,pe=me.length;ye<pe;ye++)xa(me[ye],L,Z,k)}function pu(y,L,Z,k){let{opaque:B,transmissive:me,transparent:ye}=y;if(w.setupLightsView(Z),Ye===!0)oe.setGlobalState(M.clippingPlanes,Z);if(k)b.viewport(Q.copy(k));if(B.length>0)Us(B,L,Z);if(me.length>0)Us(me,L,Z);if(ye.length>0)Us(ye,L,Z);b.buffers.depth.setTest(!0),b.buffers.depth.setMask(!0),b.buffers.color.setMask(!0),b.setPolygonOffset(!1)}function mu(y,L,Z,k){if((Z.isScene===!0?Z.overrideMaterial:null)!==null)return;if(w.state.transmissionRenderTarget[k.id]===void 0){let be=et.has("EXT_color_buffer_half_float")||et.has("EXT_color_buffer_float");w.state.transmissionRenderTarget[k.id]=new rn(1,1,{generateMipmaps:!0,type:be?On:En,minFilter:Un,samples:Math.max(4,_t.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:He.workingColorSpace})}let me=w.state.transmissionRenderTarget[k.id],ye=k.viewport||Q;me.setSize(ye.z*M.transmissionResolutionScale,ye.w*M.transmissionResolutionScale);let pe=M.getRenderTarget(),Se=M.getActiveCubeFace(),Me=M.getActiveMipmapLevel();if(M.setRenderTarget(me),M.getClearColor(Ee),qe=M.getClearAlpha(),qe<1)M.setClearColor(16777215,0.5);if(M.clear(),It)Le.render(Z);let Be=M.toneMapping;M.toneMapping=wn;let We=k.viewport;if(k.viewport!==void 0)k.viewport=void 0;if(w.setupLightsView(k),Ye===!0)oe.setGlobalState(M.clippingPlanes,k);if(Us(y,Z,k),W.updateMultisampleRenderTarget(me),W.updateRenderTargetMipmap(me),et.has("WEBGL_multisampled_render_to_texture")===!1){let be=!1;for(let nt=0,At=L.length;nt<At;nt++){let pt=L[nt],{object:ct,geometry:Ht,material:xe,group:Zt}=pt;if(xe.side===pn&&ct.layers.test(k.layers)){let Ke=xe.side;xe.side=jt,xe.needsUpdate=!0,gu(ct,Z,k,Ht,xe,Zt),xe.side=Ke,xe.needsUpdate=!0,be=!0}}if(be===!0)W.updateMultisampleRenderTarget(me),W.updateRenderTargetMipmap(me)}if(M.setRenderTarget(pe,Se,Me),M.setClearColor(Ee,qe),We!==void 0)k.viewport=We;M.toneMapping=Be}function Us(y,L,Z){let k=L.isScene===!0?L.overrideMaterial:null;for(let B=0,me=y.length;B<me;B++){let ye=y[B],{object:pe,geometry:Se,group:Me}=ye,Be=ye.material;if(Be.allowOverride===!0&&k!==null)Be=k;if(pe.layers.test(Z.layers))gu(pe,L,Z,Se,Be,Me)}}function gu(y,L,Z,k,B,me){if(U!==null&&B.isNodeMaterial)U.setObject(y,B);if(y.onBeforeRender(M,L,Z,k,B,me),y.modelViewMatrix.multiplyMatrices(Z.matrixWorldInverse,y.matrixWorld),y.normalMatrix.getNormalMatrix(y.modelViewMatrix),B.onBeforeRender(M,L,Z,k,y,me),B.transparent===!0&&B.side===pn&&B.forceSinglePass===!1)B.side=jt,B.needsUpdate=!0,M.renderBufferDirect(Z,L,k,B,y,me),B.side=bi,B.needsUpdate=!0,M.renderBufferDirect(Z,L,k,B,y,me),B.side=pn;else M.renderBufferDirect(Z,L,k,B,y,me);y.onAfterRender(M,L,Z,k,B,me)}function Os(y,L,Z){if(L.isScene!==!0)L=Yt;let k=I.get(y),B=w.state.lights,me=w.state.shadowsArray,ye=B.state.version,pe=j.getParameters(y,B.state,me,L,Z,w.state.lightProbeGridArray),Se=j.getProgramCacheKey(pe),Me=k.programs;k.environment=y.isMeshStandardMaterial||y.isMeshLambertMaterial||y.isMeshPhongMaterial?L.environment:null,k.fog=L.fog;let Be=y.isMeshStandardMaterial||y.isMeshLambertMaterial&&!y.envMap||y.isMeshPhongMaterial&&!y.envMap;if(k.envMap=ne.get(y.envMap||k.environment,Be),k.envMapRotation=k.environment!==null&&y.envMap===null?L.environmentRotation:y.envMapRotation,Me===void 0)y.addEventListener("dispose",Rn),Me=new Map,k.programs=Me;let We=Me.get(Se);if(We!==void 0){if(k.currentProgram===We&&k.lightsStateVersion===ye)return xu(y,pe),We}else{if(pe.uniforms=j.getUniforms(y),U!==null&&y.isNodeMaterial)U.build(y,Z,pe);y.onBeforeCompile(pe,M),We=j.acquireProgram(pe,Se),Me.set(Se,We),k.uniforms=pe.uniforms}let be=k.uniforms;if(!y.isShaderMaterial&&!y.isRawShaderMaterial||y.clipping===!0)be.clippingPlanes=oe.uniform;if(xu(y,pe),k.needsLights=S_(y),k.lightsStateVersion=ye,k.needsLights)be.ambientLightColor.value=B.state.ambient,be.lightProbe.value=B.state.probe,be.sunLights.value=B.state.sun,be.sunLightShadows.value=B.state.sunShadow,be.directionalLights.value=B.state.directional,be.directionalLightShadows.value=B.state.directionalShadow,be.spotLights.value=B.state.spot,be.spotLightShadows.value=B.state.spotShadow,be.rectAreaLights.value=B.state.rectArea,be.ltc_1.value=B.state.rectAreaLTC1,be.ltc_2.value=B.state.rectAreaLTC2,be.pointLights.value=B.state.point,be.pointLightShadows.value=B.state.pointShadow,be.hemisphereLights.value=B.state.hemi,be.sunShadowMatrix.value=B.state.sunShadowMatrix,be.sunShadowCascade.value=B.state.sunShadowCascade,be.directionalShadowMatrix.value=B.state.directionalShadowMatrix,be.spotLightMatrix.value=B.state.spotLightMatrix,be.spotLightMap.value=B.state.spotLightMap,be.pointShadowMatrix.value=B.state.pointShadowMatrix;return k.lightProbeGrid=w.state.lightProbeGridArray.length>0,k.currentProgram=We,k.uniformsList=null,We}function _u(y){if(y.uniformsList===null){let L=y.currentProgram.getUniforms();y.uniformsList=Ns.seqWithValue(L.seq,y.uniforms)}return y.uniformsList}function xu(y,L){let Z=I.get(y);Z.outputColorSpace=L.outputColorSpace,Z.batching=L.batching,Z.batchingColor=L.batchingColor,Z.instancing=L.instancing,Z.instancingColor=L.instancingColor,Z.instancingMorph=L.instancingMorph,Z.skinning=L.skinning,Z.morphTargets=L.morphTargets,Z.morphNormals=L.morphNormals,Z.morphColors=L.morphColors,Z.morphTargetsCount=L.morphTargetsCount,Z.numClippingPlanes=L.numClippingPlanes,Z.numIntersection=L.numClipIntersection,Z.vertexAlphas=L.vertexAlphas,Z.vertexTangents=L.vertexTangents,Z.toneMapping=L.toneMapping}function x_(y,L){if(y.length===0)return null;if(y.length===1)return y[0].texture!==null?y[0]:null;A.setFromMatrixPosition(L.matrixWorld);for(let Z=0,k=y.length;Z<k;Z++){let B=y[Z];if(B.texture!==null&&B.boundingBox.containsPoint(A))return B}return null}function v_(y,L,Z,k,B){if(L.isScene!==!0)L=Yt;W.resetTextureUnits();let me=L.fog,ye=k.isMeshStandardMaterial||k.isMeshLambertMaterial||k.isMeshPhongMaterial?L.environment:null,pe=G===null?M.outputColorSpace:G.isXRRenderTarget===!0?G.texture.colorSpace:He.workingColorSpace,Se=k.isMeshStandardMaterial||k.isMeshLambertMaterial&&!k.envMap||k.isMeshPhongMaterial&&!k.envMap,Me=ne.get(k.envMap||ye,Se),Be=k.vertexColors===!0&&!!Z.attributes.color&&Z.attributes.color.itemSize===4,We=!!Z.attributes.tangent&&(!!k.normalMap||k.anisotropy>0),be=!!Z.morphAttributes.position,nt=!!Z.morphAttributes.normal,At=!!Z.morphAttributes.color,pt=wn;if(k.toneMapped){if(G===null||G.isXRRenderTarget===!0)pt=M.toneMapping}let ct=Z.morphAttributes.position||Z.morphAttributes.normal||Z.morphAttributes.color,Ht=ct!==void 0?ct.length:0,xe=I.get(k),Zt=w.state.lights;if(Ye===!0){if(it===!0||y!==X){let ht=y===X&&k.id===ie;oe.setState(k,y,ht)}}let Ke=!1;if(k.version===xe.__version){if(xe.needsLights&&xe.lightsStateVersion!==Zt.state.version)Ke=!0;else if(xe.outputColorSpace!==pe)Ke=!0;else if(B.isBatchedMesh&&xe.batching===!1)Ke=!0;else if(!B.isBatchedMesh&&xe.batching===!0)Ke=!0;else if(B.isBatchedMesh&&xe.batchingColor===!0&&B._colorsTexture===null)Ke=!0;else if(B.isBatchedMesh&&xe.batchingColor===!1&&B._colorsTexture!==null)Ke=!0;else if(B.isInstancedMesh&&xe.instancing===!1)Ke=!0;else if(!B.isInstancedMesh&&xe.instancing===!0)Ke=!0;else if(B.isSkinnedMesh&&xe.skinning===!1)Ke=!0;else if(!B.isSkinnedMesh&&xe.skinning===!0)Ke=!0;else if(B.isInstancedMesh&&xe.instancingColor===!0&&B.instanceColor===null)Ke=!0;else if(B.isInstancedMesh&&xe.instancingColor===!1&&B.instanceColor!==null)Ke=!0;else if(B.isInstancedMesh&&xe.instancingMorph===!0&&B.morphTexture===null)Ke=!0;else if(B.isInstancedMesh&&xe.instancingMorph===!1&&B.morphTexture!==null)Ke=!0;else if(xe.envMap!==Me)Ke=!0;else if(k.fog===!0&&xe.fog!==me)Ke=!0;else if(xe.numClippingPlanes!==void 0&&(xe.numClippingPlanes!==oe.numPlanes||xe.numIntersection!==oe.numIntersection))Ke=!0;else if(xe.vertexAlphas!==Be)Ke=!0;else if(xe.vertexTangents!==We)Ke=!0;else if(xe.morphTargets!==be)Ke=!0;else if(xe.morphNormals!==nt)Ke=!0;else if(xe.morphColors!==At)Ke=!0;else if(xe.toneMapping!==pt)Ke=!0;else if(xe.morphTargetsCount!==Ht)Ke=!0;else if(!!xe.lightProbeGrid!==w.state.lightProbeGridArray.length>0)Ke=!0}else Ke=!0,xe.__version=k.version;let un=xe.currentProgram;if(Ke===!0){if(un=Os(k,L,B),U&&k.isNodeMaterial)U.onUpdateProgram(k,un,xe)}let Cn=!1,ci=!1,ir=!1,at=un.getUniforms(),Mt=xe.uniforms;if(b.useProgram(un.program))Cn=!0,ci=!0,ir=!0;if(k.id!==ie)ie=k.id,ci=!0;if(xe.needsLights){let ht=x_(w.state.lightProbeGridArray,B);if(xe.lightProbeGrid!==ht)xe.lightProbeGrid=ht,ci=!0}if(Cn||X!==y){if(b.buffers.depth.getReversed()&&y.reversedDepth!==!0)y._reversedDepth=!0,y.updateProjectionMatrix();at.setValue(P,"projectionMatrix",y.projectionMatrix),at.setValue(P,"viewMatrix",y.matrixWorldInverse);let ui=at.map.cameraPosition;if(ui!==void 0)ui.setValue(P,kt.setFromMatrixPosition(y.matrixWorld));if(_t.logarithmicDepthBuffer)at.setValue(P,"logDepthBufFC",2/(Math.log(y.far+1)/Math.LN2));if(k.isMeshPhongMaterial||k.isMeshToonMaterial||k.isMeshLambertMaterial||k.isMeshBasicMaterial||k.isMeshStandardMaterial||k.isShaderMaterial)at.setValue(P,"isOrthographic",y.isOrthographicCamera===!0);if(X!==y)X=y,ci=!0,ir=!0}if(xe.needsLights){if(Zt.state.sunShadowMap.length>0)at.setValue(P,"sunShadowMap",Zt.state.sunShadowMap,W);if(Zt.state.directionalShadowMap.length>0)at.setValue(P,"directionalShadowMap",Zt.state.directionalShadowMap,W);if(Zt.state.spotShadowMap.length>0)at.setValue(P,"spotShadowMap",Zt.state.spotShadowMap,W);if(Zt.state.pointShadowMap.length>0)at.setValue(P,"pointShadowMap",Zt.state.pointShadowMap,W)}if(B.isSkinnedMesh){at.setOptional(P,B,"bindMatrix"),at.setOptional(P,B,"bindMatrixInverse");let ht=B.skeleton;if(ht){if(ht.boneTexture===null)ht.computeBoneTexture();at.setValue(P,"boneTexture",ht.boneTexture,W)}}if(B.isBatchedMesh){if(at.setOptional(P,B,"batchingTexture"),at.setValue(P,"batchingTexture",B._matricesTexture,W),at.setOptional(P,B,"batchingIdTexture"),at.setValue(P,"batchingIdTexture",B._indirectTexture,W),at.setOptional(P,B,"batchingColorTexture"),B._colorsTexture!==null)at.setValue(P,"batchingColorTexture",B._colorsTexture,W)}let li=Z.morphAttributes;if(li.position!==void 0||li.normal!==void 0||li.color!==void 0)je.update(B,Z,un);if(ci||xe.receiveShadow!==B.receiveShadow)xe.receiveShadow=B.receiveShadow,at.setValue(P,"receiveShadow",B.receiveShadow);if((k.isMeshStandardMaterial||k.isMeshLambertMaterial||k.isMeshPhongMaterial)&&k.envMap===null&&L.environment!==null)Mt.envMapIntensity.value=L.environmentIntensity;if(Mt.dfgLUT!==void 0)Mt.dfgLUT.value=FM();if(ci){if(at.setValue(P,"toneMappingExposure",M.toneMappingExposure),xe.needsLights)y_(Mt,ir);if(me&&k.fog===!0)ge.refreshFogUniforms(Mt,me);if(ge.refreshMaterialUniforms(Mt,k,re,q,w.state.transmissionRenderTarget[y.id]),xe.needsLights&&xe.lightProbeGrid){let ht=xe.lightProbeGrid;Mt.probesSH.value=ht.texture,Mt.probesMin.value.copy(ht.boundingBox.min),Mt.probesMax.value.copy(ht.boundingBox.max),Mt.probesResolution.value.copy(ht.resolution)}Ns.upload(P,_u(xe),Mt,W)}if(k.isShaderMaterial&&k.uniformsNeedUpdate===!0)Ns.upload(P,_u(xe),Mt,W),k.uniformsNeedUpdate=!1;if(k.isSpriteMaterial)at.setValue(P,"center",B.center);if(at.setValue(P,"modelViewMatrix",B.modelViewMatrix),at.setValue(P,"normalMatrix",B.normalMatrix),at.setValue(P,"modelMatrix",B.matrixWorld),k.uniformsGroups!==void 0){let ht=k.uniformsGroups;for(let ui=0,rr=ht.length;ui<rr;ui++){let yu=ht[ui];_e.update(yu,un),_e.bind(yu,un)}}return un}function y_(y,L){y.ambientLightColor.needsUpdate=L,y.lightProbe.needsUpdate=L,y.sunLights.needsUpdate=L,y.sunLightShadows.needsUpdate=L,y.directionalLights.needsUpdate=L,y.directionalLightShadows.needsUpdate=L,y.pointLights.needsUpdate=L,y.pointLightShadows.needsUpdate=L,y.spotLights.needsUpdate=L,y.spotLightShadows.needsUpdate=L,y.rectAreaLights.needsUpdate=L,y.hemisphereLights.needsUpdate=L}function S_(y){return y.isMeshLambertMaterial||y.isMeshToonMaterial||y.isMeshPhongMaterial||y.isMeshStandardMaterial||y.isShadowMaterial||y.isShaderMaterial&&y.lights===!0}this.getActiveCubeFace=function(){return F},this.getActiveMipmapLevel=function(){return V},this.getRenderTarget=function(){return G},this.setRenderTargetTextures=function(y,L,Z){let k=I.get(y);if(k.__autoAllocateDepthBuffer=y.resolveDepthBuffer===!1,k.__autoAllocateDepthBuffer===!1)k.__useRenderToTexture=!1;I.get(y.texture).__webglTexture=L,I.get(y.depthTexture).__webglTexture=k.__autoAllocateDepthBuffer?void 0:Z,k.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(y,L){let Z=I.get(y);Z.__webglFramebuffer=L,Z.__useDefaultFramebuffer=L===void 0},this.setRenderTarget=function(y,L=0,Z=0){G=y,F=L,V=Z;let k=null,B=!1,me=!1;if(y){let pe=I.get(y);if(pe.__useDefaultFramebuffer!==void 0){b.bindFramebuffer(P.FRAMEBUFFER,pe.__webglFramebuffer),Q.copy(y.viewport),ee.copy(y.scissor),ve=y.scissorTest,b.viewport(Q),b.scissor(ee),b.setScissorTest(ve),ie=-1;return}else if(pe.__webglFramebuffer===void 0)W.setupRenderTarget(y);else if(pe.__hasExternalTextures)W.rebindTextures(y,I.get(y.texture).__webglTexture,I.get(y.depthTexture).__webglTexture);else if(y.depthBuffer){let Be=y.depthTexture;if(pe.__boundDepthTexture!==Be){if(Be!==null&&I.has(Be)&&(y.width!==Be.image.width||y.height!==Be.image.height))throw Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");W.setupDepthRenderbuffer(y)}}let Se=y.texture;if(Se.isData3DTexture||Se.isDataArrayTexture||Se.isCompressedArrayTexture)me=!0;let Me=I.get(y).__webglFramebuffer;if(y.isWebGLCubeRenderTarget){if(Array.isArray(Me[L]))k=Me[L][Z];else k=Me[L];B=!0}else if(y.samples>0&&W.useMultisampledRTT(y)===!1)k=I.get(y).__webglMultisampledFramebuffer;else if(Array.isArray(Me))k=Me[Z];else k=Me;Q.copy(y.viewport),ee.copy(y.scissor),ve=y.scissorTest}else Q.copy(Ne).multiplyScalar(re).floor(),ee.copy(Re).multiplyScalar(re).floor(),ve=Ct;if(Z!==0)k=z;if(b.bindFramebuffer(P.FRAMEBUFFER,k))b.drawBuffers(y,k);if(b.viewport(Q),b.scissor(ee),b.setScissorTest(ve),B){let pe=I.get(y.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_CUBE_MAP_POSITIVE_X+L,pe.__webglTexture,Z)}else if(me){let pe=L;for(let Se=0;Se<y.textures.length;Se++){let Me=I.get(y.textures[Se]);P.framebufferTextureLayer(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0+Se,Me.__webglTexture,Z,pe)}}else if(y!==null&&Z!==0){let pe=I.get(y.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,pe.__webglTexture,Z)}ie=-1};function vu(y){let L=I.get(y);if(L.__readFormat!==y.format||L.__readType!==y.type)L.__readFormat=y.format,L.__readType=y.type,L.__formatReadable=_t.textureFormatReadable(y.format),L.__typeReadable=_t.textureTypeReadable(y.type);return L}if(this.readRenderTargetPixels=function(y,L,Z,k,B,me,ye,pe=0){if(!(y&&y.isWebGLRenderTarget)){De("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Se=I.get(y).__webglFramebuffer;if(y.isWebGLCubeRenderTarget&&ye!==void 0)Se=Se[ye];if(Se){b.bindFramebuffer(P.FRAMEBUFFER,Se);try{let Me=y.textures[pe],{format:Be,type:We}=Me;if(y.textures.length>1)P.readBuffer(P.COLOR_ATTACHMENT0+pe);let be=vu(Me);if(be.__formatReadable===!1){De("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(be.__typeReadable===!1){De("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}if(L>=0&&L<=y.width-k&&(Z>=0&&Z<=y.height-B))P.readPixels(L,Z,k,B,J.convert(Be),J.convert(We),me)}finally{let Me=G!==null?I.get(G).__webglFramebuffer:null;b.bindFramebuffer(P.FRAMEBUFFER,Me)}}},this.readRenderTargetPixelsAsync=async function(y,L,Z,k,B,me,ye,pe=0){if(!(y&&y.isWebGLRenderTarget))throw Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Se=I.get(y).__webglFramebuffer;if(y.isWebGLCubeRenderTarget&&ye!==void 0)Se=Se[ye];if(Se)if(L>=0&&L<=y.width-k&&(Z>=0&&Z<=y.height-B)){b.bindFramebuffer(P.FRAMEBUFFER,Se);let Me=y.textures[pe],{format:Be,type:We}=Me;if(y.textures.length>1)P.readBuffer(P.COLOR_ATTACHMENT0+pe);let be=vu(Me);if(be.__formatReadable===!1)throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(be.__typeReadable===!1)throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let nt=P.createBuffer();P.bindBuffer(P.PIXEL_PACK_BUFFER,nt),P.bufferData(P.PIXEL_PACK_BUFFER,me.byteLength,P.STREAM_READ),P.readPixels(L,Z,k,B,J.convert(Be),J.convert(We),0),P.bindBuffer(P.PIXEL_PACK_BUFFER,null);let At=G!==null?I.get(G).__webglFramebuffer:null;b.bindFramebuffer(P.FRAMEBUFFER,At);let pt=P.fenceSync(P.SYNC_GPU_COMMANDS_COMPLETE,0);return P.flush(),await Zm(P,pt,4),P.bindBuffer(P.PIXEL_PACK_BUFFER,nt),P.getBufferSubData(P.PIXEL_PACK_BUFFER,0,me),P.bindBuffer(P.PIXEL_PACK_BUFFER,null),P.deleteBuffer(nt),P.deleteSync(pt),me}else throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(y,L=null,Z=0){let k=Math.pow(2,-Z),B=Math.floor(y.image.width*k),me=Math.floor(y.image.height*k),ye=L!==null?L.x:0,pe=L!==null?L.y:0;W.setTexture2D(y,0),P.copyTexSubImage2D(P.TEXTURE_2D,Z,0,0,ye,pe,B,me),b.unbindTexture()},this.copyTextureToTexture=function(y,L,Z=null,k=null,B=0,me=0){let ye,pe,Se,Me,Be,We,be,nt,At,pt=y.isCompressedTexture?y.mipmaps[me]:y.image;if(Z!==null)ye=Z.max.x-Z.min.x,pe=Z.max.y-Z.min.y,Se=Z.isBox3?Z.max.z-Z.min.z:1,Me=Z.min.x,Be=Z.min.y,We=Z.isBox3?Z.min.z:0;else{let Mt=Math.pow(2,-B);if(ye=Math.floor(pt.width*Mt),pe=Math.floor(pt.height*Mt),y.isDataArrayTexture)Se=pt.depth;else if(y.isData3DTexture)Se=Math.floor(pt.depth*Mt);else Se=1;Me=0,Be=0,We=0}if(k!==null)be=k.x,nt=k.y,At=k.z;else be=0,nt=0,At=0;let ct=J.convert(L.format),Ht=J.convert(L.type),xe;if(L.isData3DTexture)W.setTexture3D(L,0),xe=P.TEXTURE_3D;else if(L.isDataArrayTexture||L.isCompressedArrayTexture)W.setTexture2DArray(L,0),xe=P.TEXTURE_2D_ARRAY;else W.setTexture2D(L,0),xe=P.TEXTURE_2D;b.activeTexture(P.TEXTURE0),b.pixelStorei(P.UNPACK_FLIP_Y_WEBGL,L.flipY),b.pixelStorei(P.UNPACK_PREMULTIPLY_ALPHA_WEBGL,L.premultiplyAlpha),b.pixelStorei(P.UNPACK_ALIGNMENT,L.unpackAlignment);let Zt=b.getParameter(P.UNPACK_ROW_LENGTH),Ke=b.getParameter(P.UNPACK_IMAGE_HEIGHT),un=b.getParameter(P.UNPACK_SKIP_PIXELS),Cn=b.getParameter(P.UNPACK_SKIP_ROWS),ci=b.getParameter(P.UNPACK_SKIP_IMAGES);b.pixelStorei(P.UNPACK_ROW_LENGTH,pt.width),b.pixelStorei(P.UNPACK_IMAGE_HEIGHT,pt.height),b.pixelStorei(P.UNPACK_SKIP_PIXELS,Me),b.pixelStorei(P.UNPACK_SKIP_ROWS,Be),b.pixelStorei(P.UNPACK_SKIP_IMAGES,We);let ir=y.isDataArrayTexture||y.isData3DTexture,at=L.isDataArrayTexture||L.isData3DTexture;if(y.isDepthTexture){let Mt=I.get(y),li=I.get(L),ht=I.get(Mt.__renderTarget),ui=I.get(li.__renderTarget);b.bindFramebuffer(P.READ_FRAMEBUFFER,ht.__webglFramebuffer),b.bindFramebuffer(P.DRAW_FRAMEBUFFER,ui.__webglFramebuffer);for(let rr=0;rr<Se;rr++){if(ir)P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,I.get(y).__webglTexture,B,We+rr),P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,I.get(L).__webglTexture,me,At+rr);P.blitFramebuffer(Me,Be,ye,pe,be,nt,ye,pe,P.DEPTH_BUFFER_BIT,P.NEAREST)}b.bindFramebuffer(P.READ_FRAMEBUFFER,null),b.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else if(B!==0||y.isRenderTargetTexture||I.has(y)){let Mt=I.get(y),li=I.get(L);b.bindFramebuffer(P.READ_FRAMEBUFFER,N),b.bindFramebuffer(P.DRAW_FRAMEBUFFER,C);for(let ht=0;ht<Se;ht++){if(ir)P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,Mt.__webglTexture,B,We+ht);else P.framebufferTexture2D(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,Mt.__webglTexture,B);if(at)P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,li.__webglTexture,me,At+ht);else P.framebufferTexture2D(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,li.__webglTexture,me);if(B!==0)P.blitFramebuffer(Me,Be,ye,pe,be,nt,ye,pe,P.COLOR_BUFFER_BIT,P.NEAREST);else if(at)P.copyTexSubImage3D(xe,me,be,nt,At+ht,Me,Be,ye,pe);else P.copyTexSubImage2D(xe,me,be,nt,Me,Be,ye,pe)}b.bindFramebuffer(P.READ_FRAMEBUFFER,null),b.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else if(at)if(y.isDataTexture||y.isData3DTexture)P.texSubImage3D(xe,me,be,nt,At,ye,pe,Se,ct,Ht,pt.data);else if(L.isCompressedArrayTexture)P.compressedTexSubImage3D(xe,me,be,nt,At,ye,pe,Se,ct,pt.data);else P.texSubImage3D(xe,me,be,nt,At,ye,pe,Se,ct,Ht,pt);else if(y.isDataTexture)P.texSubImage2D(P.TEXTURE_2D,me,be,nt,ye,pe,ct,Ht,pt.data);else if(y.isCompressedTexture)P.compressedTexSubImage2D(P.TEXTURE_2D,me,be,nt,pt.width,pt.height,ct,pt.data);else P.texSubImage2D(P.TEXTURE_2D,me,be,nt,ye,pe,ct,Ht,pt);if(b.pixelStorei(P.UNPACK_ROW_LENGTH,Zt),b.pixelStorei(P.UNPACK_IMAGE_HEIGHT,Ke),b.pixelStorei(P.UNPACK_SKIP_PIXELS,un),b.pixelStorei(P.UNPACK_SKIP_ROWS,Cn),b.pixelStorei(P.UNPACK_SKIP_IMAGES,ci),me===0&&L.generateMipmaps)P.generateMipmap(xe);b.unbindTexture()},this.initRenderTarget=function(y){if(I.get(y).__webglFramebuffer===void 0)W.setupRenderTarget(y)},this.initTexture=function(y){if(y.isCubeTexture)W.setTextureCube(y,0);else if(y.isData3DTexture)W.setTexture3D(y,0);else if(y.isDataArrayTexture||y.isCompressedArrayTexture)W.setTexture2DArray(y,0);else W.setTexture2D(y,0);b.unbindTexture()},this.resetState=function(){F=0,V=0,G=null,b.reset(),le.reset()},typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return bl}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=He._getDrawingBufferColorSpace(e),t.unpackColorSpace=He._getUnpackColorSpace()}}function tu(e,t){if(t===_l)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),e;if(t===Nr||t===fs){let n=e.getIndex();if(n===null){let s=[],o=e.getAttribute("position");if(o!==void 0){for(let a=0;a<o.count;a++)s.push(a);e.setIndex(s),n=e.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),e}let i=n.count-2,r=[];if(t===Nr)for(let s=1;s<=i;s++)r.push(n.getX(0)),r.push(n.getX(s)),r.push(n.getX(s+1));else for(let s=0;s<i;s++)if(s%2===0)r.push(n.getX(s)),r.push(n.getX(s+1)),r.push(n.getX(s+2));else r.push(n.getX(s+2)),r.push(n.getX(s+1)),r.push(n.getX(s));if(r.length/3!==i)console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");return e.setIndex(r),e.clearGroups(),e}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",t),e}function zg(e){let t=new Map,n=new Map,i=e.clone();return kg(e,i,function(r,s){t.set(s,r),n.set(r,s)}),i.traverse(function(r){if(!r.isSkinnedMesh)return;let s=r,o=t.get(r),a=o.skeleton.bones;s.skeleton=o.skeleton.clone(),s.bindMatrix.copy(o.bindMatrix),s.skeleton.bones=a.map(function(c){return n.get(c)}),s.bind(s.skeleton,s.bindMatrix)}),i}function kg(e,t,n){n(e,t);for(let i=0;i<e.children.length;i++)kg(e.children[i],t.children[i],n)}class cu extends ai{constructor(e){super(e);this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new Xg(t)}),this.register(function(t){return new qg(t)}),this.register(function(t){return new i_(t)}),this.register(function(t){return new r_(t)}),this.register(function(t){return new s_(t)}),this.register(function(t){return new Jg(t)}),this.register(function(t){return new Kg(t)}),this.register(function(t){return new jg(t)}),this.register(function(t){return new Qg(t)}),this.register(function(t){return new Zg(t)}),this.register(function(t){return new e_(t)}),this.register(function(t){return new Yg(t)}),this.register(function(t){return new n_(t)}),this.register(function(t){return new t_(t)}),this.register(function(t){return new Wg(t)}),this.register(function(t){return new su(t,Ve.EXT_MESHOPT_COMPRESSION)}),this.register(function(t){return new su(t,Ve.KHR_MESHOPT_COMPRESSION)}),this.register(function(t){return new o_(t)})}load(e,t,n,i){let r=this,s;if(this.resourcePath!=="")s=this.resourcePath;else if(this.path!==""){let c=Ii.extractUrlBase(e);s=Ii.resolveURL(c,this.path)}else s=Ii.extractUrlBase(e);this.manager.itemStart(e);let o=function(c){if(i)i(c);else console.error(c);r.manager.itemError(e),r.manager.itemEnd(e)},a=new Rs(this.manager);a.setPath(this.path),a.setResponseType("arraybuffer"),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(e,function(c){try{r.parse(c,s,function(l){t(l),r.manager.itemEnd(e)},o)}catch(l){o(l)}},n,o)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){if(this.pluginCallbacks.indexOf(e)===-1)this.pluginCallbacks.push(e);return this}unregister(e){if(this.pluginCallbacks.indexOf(e)!==-1)this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1);return this}parse(e,t,n,i){let r,s={},o={},a=new TextDecoder;if(typeof e==="string")r=JSON.parse(e);else if(e instanceof ArrayBuffer)if(a.decode(new Uint8Array(e,0,4))===a_){try{s[Ve.KHR_BINARY_GLTF]=new c_(e)}catch(u){if(i)i(u);return}r=JSON.parse(s[Ve.KHR_BINARY_GLTF].content)}else r=JSON.parse(a.decode(e));else r=e;if(r.asset===void 0||r.asset.version[0]<2){if(i)i(Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}let c=new f_(r,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let l=0;l<this.pluginCallbacks.length;l++){let u=this.pluginCallbacks[l](c);if(!u.name)console.error("THREE.GLTFLoader: Invalid plugin found: missing name");o[u.name]=u,s[u.name]=!0}if(r.extensionsUsed)for(let l=0;l<r.extensionsUsed.length;++l){let u=r.extensionsUsed[l],d=r.extensionsRequired||[];switch(u){case Ve.KHR_MATERIALS_UNLIT:s[u]=new $g;break;case Ve.KHR_DRACO_MESH_COMPRESSION:s[u]=new l_(r,this.dracoLoader);break;case Ve.KHR_TEXTURE_TRANSFORM:s[u]=new u_;break;case Ve.KHR_MESH_QUANTIZATION:s[u]=new h_;break;default:if(d.indexOf(u)>=0&&o[u]===void 0)console.warn('THREE.GLTFLoader: Unknown extension "'+u+'".')}}c.setExtensions(s),c.setPlugins(o),c.parse(n,i)}parseAsync(e,t){let n=this;return new Promise(function(i,r){n.parse(e,t,i,r)})}}function kM(){let e={};return{get:function(t){return e[t]},add:function(t,n){e[t]=n},remove:function(t){delete e[t]},removeAll:function(){e={}}}}function Et(e,t,n){let i=e.json.materials[t];if(i.extensions&&i.extensions[n])return i.extensions[n];return null}var Ve={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class Wg{constructor(e){this.parser=e,this.name=Ve.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){let e=this.parser,t=this.parser.json.nodes||[];for(let n=0,i=t.length;n<i;n++){let r=t[n];if(r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0)e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){let t=this.parser,n="light:"+e,i=t.cache.get(n);if(i)return i;let r=t.json,a=((r.extensions&&r.extensions[this.name]||{}).lights||[])[e],c,l=new Ie(16777215);if(a.color!==void 0)l.setRGB(a.color[0],a.color[1],a.color[2],nn);let u=a.range!==void 0?a.range:0;switch(a.type){case"directional":c=new Fr(l),c.target.position.set(0,0,-1),c.add(c.target);break;case"point":c=new ca(l),c.distance=u;break;case"spot":c=new aa(l),c.distance=u,a.spot=a.spot||{},a.spot.innerConeAngle=a.spot.innerConeAngle!==void 0?a.spot.innerConeAngle:0,a.spot.outerConeAngle=a.spot.outerConeAngle!==void 0?a.spot.outerConeAngle:Math.PI/4,c.angle=a.spot.outerConeAngle,c.penumbra=1-a.spot.innerConeAngle/a.spot.outerConeAngle,c.target.position.set(0,0,-1),c.add(c.target);break;default:throw Error("THREE.GLTFLoader: Unexpected light type: "+a.type)}if(c.position.set(0,0,0),$n(c,a),a.intensity!==void 0)c.intensity=a.intensity;return c.name=t.createUniqueName(a.name||"light_"+e),i=Promise.resolve(c),t.cache.add(n,i),i}getDependency(e,t){if(e!=="light")return;return this._loadLight(t)}createNodeAttachment(e){let t=this,n=this.parser,r=n.json.nodes[e],o=(r.extensions&&r.extensions[this.name]||{}).light;if(o===void 0)return null;return this._loadLight(o).then(function(a){return n._getNodeRef(t.cache,o,a)})}}class $g{constructor(){this.name=Ve.KHR_MATERIALS_UNLIT}getMaterialType(){return kn}extendParams(e,t,n){let i=[];e.color=new Ie(1,1,1),e.opacity=1;let r=t.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){let s=r.baseColorFactor;e.color.setRGB(s[0],s[1],s[2],nn),e.opacity=s[3]}if(r.baseColorTexture!==void 0)i.push(n.assignTexture(e,"map",r.baseColorTexture,wi))}return Promise.all(i)}}class Zg{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();if(n.emissiveStrength!==void 0)t.emissiveIntensity=n.emissiveStrength;return Promise.resolve()}}class Xg{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.clearcoatFactor!==void 0)t.clearcoat=n.clearcoatFactor;if(n.clearcoatTexture!==void 0)i.push(this.parser.assignTexture(t,"clearcoatMap",n.clearcoatTexture));if(n.clearcoatRoughnessFactor!==void 0)t.clearcoatRoughness=n.clearcoatRoughnessFactor;if(n.clearcoatRoughnessTexture!==void 0)i.push(this.parser.assignTexture(t,"clearcoatRoughnessMap",n.clearcoatRoughnessTexture));if(n.clearcoatNormalTexture!==void 0){if(i.push(this.parser.assignTexture(t,"clearcoatNormalMap",n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale!==void 0){let r=n.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new ze(r,r)}}return Promise.all(i)}}class qg{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_DISPERSION}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();return t.dispersion=n.dispersion!==void 0?n.dispersion:0,Promise.resolve()}}class Yg{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.iridescenceFactor!==void 0)t.iridescence=n.iridescenceFactor;if(n.iridescenceTexture!==void 0)i.push(this.parser.assignTexture(t,"iridescenceMap",n.iridescenceTexture));if(n.iridescenceIor!==void 0)t.iridescenceIOR=n.iridescenceIor;if(t.iridescenceThicknessRange===void 0)t.iridescenceThicknessRange=[100,400];if(n.iridescenceThicknessMinimum!==void 0)t.iridescenceThicknessRange[0]=n.iridescenceThicknessMinimum;if(n.iridescenceThicknessMaximum!==void 0)t.iridescenceThicknessRange[1]=n.iridescenceThicknessMaximum;if(n.iridescenceThicknessTexture!==void 0)i.push(this.parser.assignTexture(t,"iridescenceThicknessMap",n.iridescenceThicknessTexture));return Promise.all(i)}}class Jg{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_SHEEN}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.sheenColor=new Ie(0,0,0),t.sheenRoughness=0,t.sheen=1,n.sheenColorFactor!==void 0){let r=n.sheenColorFactor;t.sheenColor.setRGB(r[0],r[1],r[2],nn)}if(n.sheenRoughnessFactor!==void 0)t.sheenRoughness=n.sheenRoughnessFactor;if(n.sheenColorTexture!==void 0)i.push(this.parser.assignTexture(t,"sheenColorMap",n.sheenColorTexture,wi));if(n.sheenRoughnessTexture!==void 0)i.push(this.parser.assignTexture(t,"sheenRoughnessMap",n.sheenRoughnessTexture));return Promise.all(i)}}class Kg{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.transmissionFactor!==void 0)t.transmission=n.transmissionFactor;if(n.transmissionTexture!==void 0)i.push(this.parser.assignTexture(t,"transmissionMap",n.transmissionTexture));return Promise.all(i)}}class jg{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_VOLUME}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.thickness=n.thicknessFactor!==void 0?n.thicknessFactor:0,n.thicknessTexture!==void 0)i.push(this.parser.assignTexture(t,"thicknessMap",n.thicknessTexture));t.attenuationDistance=n.attenuationDistance||1/0;let r=n.attenuationColor||[1,1,1];return t.attenuationColor=new Ie().setRGB(r[0],r[1],r[2],nn),Promise.all(i)}}class Qg{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_IOR}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();if(t.ior=n.ior!==void 0?n.ior:1.5,t.ior===0)t.ior=1000;return Promise.resolve()}}class e_{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_SPECULAR}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.specularIntensity=n.specularFactor!==void 0?n.specularFactor:1,n.specularTexture!==void 0)i.push(this.parser.assignTexture(t,"specularIntensityMap",n.specularTexture));let r=n.specularColorFactor||[1,1,1];if(t.specularColor=new Ie().setRGB(r[0],r[1],r[2],nn),n.specularColorTexture!==void 0)i.push(this.parser.assignTexture(t,"specularColorMap",n.specularColorTexture,wi));return Promise.all(i)}}class t_{constructor(e){this.parser=e,this.name=Ve.EXT_MATERIALS_BUMP}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.bumpScale=n.bumpFactor!==void 0?n.bumpFactor:1,n.bumpTexture!==void 0)i.push(this.parser.assignTexture(t,"bumpMap",n.bumpTexture));return Promise.all(i)}}class n_{constructor(e){this.parser=e,this.name=Ve.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){return Et(this.parser,e,this.name)!==null?an:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.anisotropyStrength!==void 0)t.anisotropy=n.anisotropyStrength;if(n.anisotropyRotation!==void 0)t.anisotropyRotation=n.anisotropyRotation;if(n.anisotropyTexture!==void 0)i.push(this.parser.assignTexture(t,"anisotropyMap",n.anisotropyTexture));return Promise.all(i)}}class i_{constructor(e){this.parser=e,this.name=Ve.KHR_TEXTURE_BASISU}loadTexture(e){let t=this.parser,n=t.json,i=n.textures[e];if(!i.extensions||!i.extensions[this.name])return null;let r=i.extensions[this.name],s=t.options.ktx2Loader;if(!s)if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");else return null;return t.loadTextureImage(e,r.source,s)}}class r_{constructor(e){this.parser=e,this.name=Ve.EXT_TEXTURE_WEBP}loadTexture(e){let t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;let s=r.extensions[t],o=i.images[s.source],a=n.textureLoader;if(o.uri){let c=n.options.manager.getHandler(o.uri);if(c!==null)a=c}return n.loadTextureImage(e,s.source,a)}}class s_{constructor(e){this.parser=e,this.name=Ve.EXT_TEXTURE_AVIF}loadTexture(e){let t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;let s=r.extensions[t],o=i.images[s.source],a=n.textureLoader;if(o.uri){let c=n.options.manager.getHandler(o.uri);if(c!==null)a=c}return n.loadTextureImage(e,s.source,a)}}class su{constructor(e,t){this.name=t,this.parser=e}loadBufferView(e){let t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){let i=n.extensions[this.name],r=this.parser.getDependency("buffer",i.buffer),s=this.parser.options.meshoptDecoder;if(!s||!s.supported)if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");else return null;return r.then(function(o){let a=i.byteOffset||0,c=i.byteLength||0,{count:l,byteStride:u}=i,d=new Uint8Array(o,a,c);if(s.decodeGltfBufferAsync)return s.decodeGltfBufferAsync(l,u,d,i.mode,i.filter).then(function(h){return h.buffer});else return s.ready.then(function(){let h=new ArrayBuffer(l*u);return s.decodeGltfBuffer(new Uint8Array(h),l,u,d,i.mode,i.filter),h})})}else return null}}class o_{constructor(e){this.name=Ve.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){let t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;let i=t.meshes[n.mesh];for(let c of i.primitives)if(c.mode!==xn.TRIANGLES&&c.mode!==xn.TRIANGLE_STRIP&&c.mode!==xn.TRIANGLE_FAN&&c.mode!==void 0)return null;let s=n.extensions[this.name].attributes,o=[],a={};for(let c in s)o.push(this.parser.getDependency("accessor",s[c]).then((l)=>(a[c]=l,a[c])));if(o.length<1)return null;return o.push(this.parser.createNodeMesh(e)),Promise.all(o).then((c)=>{let l=c.pop(),u=l.isGroup?l.children:[l],d=c[0].count,h=[];for(let f of u){let g=new Oe,S=new O,p=new Gt,m=new O(1,1,1),T=new jo(f.geometry,f.material,d);for(let v=0;v<d;v++){if(a.TRANSLATION)S.fromBufferAttribute(a.TRANSLATION,v);if(a.ROTATION)p.fromBufferAttribute(a.ROTATION,v);if(a.SCALE)m.fromBufferAttribute(a.SCALE,v);T.setMatrixAt(v,g.compose(S,p,m))}let A=null;for(let v in a)if(v==="_COLOR_0"){let w=a[v];T.instanceColor=new Si(w.array,w.itemSize,w.normalized)}else if(v!=="TRANSLATION"&&v!=="ROTATION"&&v!=="SCALE"){if(A===null){let E=T.geometry;A=new Tt,A.name=E.name;for(let R in E.attributes)A.setAttribute(R,E.attributes[R]);for(let R in E.morphAttributes)A.morphAttributes[R]=E.morphAttributes[R];if(E.index!==null)A.setIndex(E.index);A.morphTargetsRelative=E.morphTargetsRelative;for(let R of E.groups)A.addGroup(R.start,R.count,R.materialIndex);if(E.boundingBox!==null)A.boundingBox=E.boundingBox.clone();if(E.boundingSphere!==null)A.boundingSphere=E.boundingSphere.clone();A.drawRange.start=E.drawRange.start,A.drawRange.count=E.drawRange.count,A.userData=Object.assign({},E.userData),T.geometry=A}let w=a[v];A.setAttribute(v,new Si(w.array,w.itemSize,w.normalized))}dt.prototype.copy.call(T,f),this.parser.assignFinalMaterial(T),h.push(T)}if(l.isGroup)return l.clear(),l.add(...h),l;return h[0]})}}var a_="glTF",Ds=12,Bg={JSON:1313821514,BIN:5130562};class c_{constructor(e){this.name=Ve.KHR_BINARY_GLTF,this.content=null,this.body=null;let t=new DataView(e,0,Ds),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==a_)throw Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");else if(this.header.version<2)throw Error("THREE.GLTFLoader: Legacy binary file detected.");let i=this.header.length-Ds,r=new DataView(e,Ds),s=0;while(s<i){let o=r.getUint32(s,!0);s+=4;let a=r.getUint32(s,!0);if(s+=4,a===Bg.JSON){let c=new Uint8Array(e,Ds+s,o);this.content=n.decode(c)}else if(a===Bg.BIN){let c=Ds+s;this.body=e.slice(c,c+o)}s+=o}if(this.content===null)throw Error("THREE.GLTFLoader: JSON content not found.")}}class l_{constructor(e,t){if(!t)throw Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=Ve.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){let n=this.json,i=this.dracoLoader,r=e.extensions[this.name].bufferView,s=e.extensions[this.name].attributes,o={},a={},c={};for(let l in s){let u=ou[l]||l.toLowerCase();o[u]=s[l]}for(let l in e.attributes){let u=ou[l]||l.toLowerCase();if(s[l]!==void 0){let d=n.accessors[e.attributes[l]],h=Gr[d.componentType];c[u]=h.name,a[u]=d.normalized===!0}}return t.getDependency("bufferView",r).then(function(l){return new Promise(function(u,d){i.decodeDracoFile(l,function(h){for(let f in h.attributes){let g=h.attributes[f],S=a[f];if(S!==void 0)g.normalized=S}u(h)},o,c,nn,d)})})}}class u_{constructor(){this.name=Ve.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){if((t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0)return e;if(e=e.clone(),t.texCoord!==void 0)e.channel=t.texCoord;if(t.offset!==void 0)e.offset.fromArray(t.offset);if(t.rotation!==void 0)e.rotation=t.rotation;if(t.scale!==void 0)e.repeat.fromArray(t.scale);if(t.rotation!==void 0){let n=Math.cos(e.rotation),i=Math.sin(e.rotation);e.matrix.set(e.repeat.x*n,e.repeat.y*i,e.offset.x,-e.repeat.x*i,e.repeat.y*n,e.offset.y,0,0,1),e.matrixAutoUpdate=!1}return e.needsUpdate=!0,e}}class h_{constructor(){this.name=Ve.KHR_MESH_QUANTIZATION}}class lu extends oi{constructor(e,t,n,i){super(e,t,n,i)}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i*3+i;for(let s=0;s!==i;s++)t[s]=n[r+s];return t}interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=o*2,c=o*3,l=i-t,u=(n-t)/l,d=u*u,h=d*u,f=e*c,g=f-c,S=-2*h+3*d,p=h-d,m=1-S,T=p-d+u;for(let A=0;A!==o;A++){let v=s[g+A+o],w=s[g+A+a]*l,E=s[f+A+o],R=s[f+A]*l;r[A]=m*v+T*w+S*E+p*R}return r}}var BM=new Gt;class d_ extends lu{interpolate_(e,t,n,i){let r=super.interpolate_(e,t,n,i);return BM.fromArray(r).normalize().toArray(r),r}}var xn={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},Gr={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Gg={9728:Tn,9729:zt,9984:Fo,9985:Pr,9986:$i,9987:Un},Hg={33071:Ir,33648:Oo,10497:Cr},nu={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},ou={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Pi={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},GM={CUBICSPLINE:void 0,LINEAR:Wo,STEP:gl},iu={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function HM(e){if(e.DefaultMaterial===void 0)e.DefaultMaterial=new Gn({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:bi});return e.DefaultMaterial}function nr(e,t,n){for(let i in n.extensions)if(e[i]===void 0)t.userData.gltfExtensions=t.userData.gltfExtensions||{},t.userData.gltfExtensions[i]=n.extensions[i]}function $n(e,t){if(t.extras!==void 0)if(typeof t.extras==="object")Object.assign(e.userData,t.extras);else console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+t.extras)}function VM(e,t,n){let i=!1,r=!1,s=!1;for(let l=0,u=t.length;l<u;l++){let d=t[l];if(d.POSITION!==void 0)i=!0;if(d.NORMAL!==void 0)r=!0;if(d.COLOR_0!==void 0)s=!0;if(i&&r&&s)break}if(!i&&!r&&!s)return Promise.resolve(e);let o=[],a=[],c=[];for(let l=0,u=t.length;l<u;l++){let d=t[l];if(i){let h=d.POSITION!==void 0?n.getDependency("accessor",d.POSITION):e.attributes.position;o.push(h)}if(r){let h=d.NORMAL!==void 0?n.getDependency("accessor",d.NORMAL):e.attributes.normal;a.push(h)}if(s){let h=d.COLOR_0!==void 0?n.getDependency("accessor",d.COLOR_0):e.attributes.color;c.push(h)}}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c)]).then(function(l){let u=l[0],d=l[1],h=l[2];if(i)e.morphAttributes.position=u;if(r)e.morphAttributes.normal=d;if(s)e.morphAttributes.color=h;return e.morphTargetsRelative=!0,e})}function WM(e,t){if(e.updateMorphTargets(),t.weights!==void 0)for(let n=0,i=t.weights.length;n<i;n++)e.morphTargetInfluences[n]=t.weights[n];if(t.extras&&Array.isArray(t.extras.targetNames)){let n=t.extras.targetNames;if(e.morphTargetInfluences.length===n.length){e.morphTargetDictionary={};for(let i=0,r=n.length;i<r;i++)e.morphTargetDictionary[n[i]]=i}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function $M(e){let t,n=e.extensions&&e.extensions[Ve.KHR_DRACO_MESH_COMPRESSION];if(n)t="draco:"+n.bufferView+":"+n.indices+":"+ru(n.attributes);else t=e.indices+":"+ru(e.attributes)+":"+e.mode;if(e.targets!==void 0)for(let i=0,r=e.targets.length;i<r;i++)t+=":"+ru(e.targets[i]);return t}function ru(e){let t="",n=Object.keys(e).sort();for(let i=0,r=n.length;i<r;i++)t+=n[i]+":"+e[n[i]]+";";return t}function au(e){switch(e){case Int8Array:return 0.007874015748031496;case Uint8Array:return 0.00392156862745098;case Int16Array:return 0.00003051850947599719;case Uint16Array:return 0.000015259021896696422;default:throw Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function ZM(e){if(e.search(/\.jpe?g($|\?)/i)>0||e.search(/^data\:image\/jpeg/)===0)return"image/jpeg";if(e.search(/\.webp($|\?)/i)>0||e.search(/^data\:image\/webp/)===0)return"image/webp";if(e.search(/\.ktx2($|\?)/i)>0||e.search(/^data\:image\/ktx2/)===0)return"image/ktx2";return"image/png"}var XM=new Oe;class f_{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new kM,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=-1,r=!1,s=-1;if(typeof navigator<"u"&&typeof navigator.userAgent<"u"){let o=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(o)===!0;let a=o.match(/Version\/(\d+)/);i=n&&a?parseInt(a[1],10):-1,r=o.indexOf("Firefox")>-1,s=r?o.match(/Firefox\/([0-9]+)\./)[1]:-1}if(typeof createImageBitmap>"u"||n&&i<17||r&&s<98)this.textureLoader=new ra(this.options.manager);else this.textureLoader=new la(this.options.manager);if(this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new Rs(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials")this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){let n=this,i=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(s){return s._markDefs&&s._markDefs()}),Promise.all(this._invokeAll(function(s){return s.beforeRoot&&s.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(s){let o={scene:s[0][i.scene||0],scenes:s[0],animations:s[1],cameras:s[2],asset:i.asset,parser:n,userData:{}};return nr(r,o,i),$n(o,i),Promise.all(n._invokeAll(function(a){return a.afterRoot&&a.afterRoot(o)})).then(function(){for(let a of o.scenes)a.updateMatrixWorld();e(o)})}).catch(t)}_markDefs(){let e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let i=0,r=t.length;i<r;i++){let s=t[i].joints;for(let o=0,a=s.length;o<a;o++)e[s[o]].isBone=!0}for(let i=0,r=e.length;i<r;i++){let s=e[i];if(s.mesh!==void 0){if(this._addNodeRef(this.meshCache,s.mesh),s.skin!==void 0)n[s.mesh].isSkinnedMesh=!0}if(s.camera!==void 0)this._addNodeRef(this.cameraCache,s.camera)}}_addNodeRef(e,t){if(t===void 0)return;if(e.refs[t]===void 0)e.refs[t]=e.uses[t]=0;e.refs[t]++}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;let i=n.clone(),r=(s,o)=>{let a=this.associations.get(s);if(a!=null)this.associations.set(o,a);for(let[c,l]of s.children.entries())r(l,o.children[c])};return r(n,i),i.name+="_instance_"+e.uses[t]++,i}_invokeOne(e){let t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){let i=e(t[n]);if(i)return i}return null}_invokeAll(e){let t=Object.values(this.plugins);t.unshift(this);let n=[];for(let i=0;i<t.length;i++){let r=e(t[i]);if(r)n.push(r)}return n}getDependency(e,t){let n=e+":"+t,i=this.cache.get(n);if(!i){switch(e){case"scene":i=this.loadScene(t);break;case"node":i=this._invokeOne(function(r){return r.loadNode&&r.loadNode(t)});break;case"mesh":i=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(t)});break;case"accessor":i=this.loadAccessor(t);break;case"bufferView":i=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(t)});break;case"buffer":i=this.loadBuffer(t);break;case"material":i=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(t)});break;case"texture":i=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(t)});break;case"skin":i=this.loadSkin(t);break;case"animation":i=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(t)});break;case"camera":i=this.loadCamera(t);break;default:if(i=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(e,t)}),!i)throw Error("Unknown type: "+e);break}this.cache.add(n,i)}return i}getDependencies(e){let t=this.cache.get(e);if(!t){let n=this,i=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(i.map(function(r,s){return n.getDependency(e,s)})),this.cache.add(e,t)}return t}loadBuffer(e){let t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[Ve.KHR_BINARY_GLTF].body);let i=this.options;return new Promise(function(r,s){n.load(Ii.resolveURL(t.uri,i.path),r,void 0,function(){s(Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){let t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(n){let i=t.byteLength||0,r=t.byteOffset||0;return n.slice(r,r+i)})}loadAccessor(e){let t=this,n=this.json,i=this.json.accessors[e];if(i.bufferView===void 0&&i.sparse===void 0){let s=nu[i.type],o=Gr[i.componentType],a=i.normalized===!0,c=new o(i.count*s);return Promise.resolve(new Ft(c,s,a))}let r=[];if(i.bufferView!==void 0)r.push(this.getDependency("bufferView",i.bufferView));else r.push(null);if(i.sparse!==void 0)r.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",i.sparse.values.bufferView));return Promise.all(r).then(function(s){let o=s[0],a=nu[i.type],c=Gr[i.componentType],l=c.BYTES_PER_ELEMENT,u=l*a,d=i.byteOffset||0,h=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,f=i.normalized===!0,g,S;if(h&&h!==u){let p=Math.floor(d/h),m="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+p+":"+i.count,T=t.cache.get(m);if(!T)g=new c(o,p*h,i.count*h/l),T=new _s(g,h/l),t.cache.add(m,T);S=new Dr(T,a,d%h/l,f)}else{if(o===null)g=new c(i.count*a);else g=new c(o,d,i.count*a);S=new Ft(g,a,f)}if(i.sparse!==void 0){let p=nu.SCALAR,m=Gr[i.sparse.indices.componentType],T=i.sparse.indices.byteOffset||0,A=i.sparse.values.byteOffset||0,v=new m(s[1],T,i.sparse.count*p),w=new c(s[2],A,i.sparse.count*a);if(o!==null)S=new Ft(S.array.slice(),S.itemSize,S.normalized);S.normalized=!1;for(let E=0,R=v.length;E<R;E++){let x=v[E];if(S.setX(x,w[E*a]),a>=2)S.setY(x,w[E*a+1]);if(a>=3)S.setZ(x,w[E*a+2]);if(a>=4)S.setW(x,w[E*a+3]);if(a>=5)throw Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}S.normalized=f}return S})}loadTexture(e){let t=this.json,n=this.options,r=t.textures[e].source,s=t.images[r],o=this.textureLoader;if(s.uri){let a=n.manager.getHandler(s.uri);if(a!==null)o=a}return this.loadTextureImage(e,r,o)}loadTextureImage(e,t,n){let i=this,r=this.json,s=r.textures[e],o=r.images[t],a=(o.uri||o.bufferView)+":"+s.sampler;if(this.textureCache[a])return this.textureCache[a];let c=this.loadImageSource(t,n).then(function(l){if(l.flipY=!1,l.name=s.name||o.name||"",l.name===""&&typeof o.uri==="string"&&o.uri.startsWith("data:image/")===!1)l.name=o.uri;let d=(r.samplers||{})[s.sampler]||{};return l.magFilter=Gg[d.magFilter]||zt,l.minFilter=Gg[d.minFilter]||Un,l.wrapS=Hg[d.wrapS]||Cr,l.wrapT=Hg[d.wrapT]||Cr,l.generateMipmaps=!l.isCompressedTexture&&l.minFilter!==Tn&&l.minFilter!==zt,i.associations.set(l,{textures:e}),l}).catch(function(){return null});return this.textureCache[a]=c,c}loadImageSource(e,t){let n=this,i=this.json,r=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then((u)=>u.clone());let s=i.images[e],o=self.URL||self.webkitURL,a=s.uri||"",c=!1;if(s.bufferView!==void 0)a=n.getDependency("bufferView",s.bufferView).then(function(u){c=!0;let d=new Blob([u],{type:s.mimeType});return a=o.createObjectURL(d),a});else if(s.uri===void 0)throw Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");let l=Promise.resolve(a).then(function(u){return new Promise(function(d,h){let f=d;if(t.isImageBitmapLoader===!0)f=function(g){let S=new St(g);S.needsUpdate=!0,d(S)};t.load(Ii.resolveURL(u,r.path),f,void 0,h)})}).then(function(u){if(c===!0)o.revokeObjectURL(a);return $n(u,s),u.userData.mimeType=s.mimeType||ZM(s.uri),u}).catch(function(u){throw console.error("THREE.GLTFLoader: Couldn't load texture",a),u});return this.sourceCache[e]=l,l}assignTexture(e,t,n,i){let r=this;return this.getDependency("texture",n.index).then(function(s){if(!s)return null;if(n.texCoord!==void 0&&n.texCoord>0)s=s.clone(),s.channel=n.texCoord;if(r.extensions[Ve.KHR_TEXTURE_TRANSFORM]){let o=n.extensions!==void 0?n.extensions[Ve.KHR_TEXTURE_TRANSFORM]:void 0;if(o){let a=r.associations.get(s);s=r.extensions[Ve.KHR_TEXTURE_TRANSFORM].extendTexture(s,o),r.associations.set(s,a)}}if(i!==void 0)s.colorSpace=i;return e[t]=s,s})}assignFinalMaterial(e){let{geometry:t,material:n}=e,i=t.attributes.tangent===void 0,r=t.attributes.color!==void 0,s=t.attributes.normal===void 0;if(e.isPoints){let o="PointsMaterial:"+n.uuid,a=this.cache.get(o);if(!a)a=new Ms,on.prototype.copy.call(a,n),a.color.copy(n.color),a.map=n.map,a.sizeAttenuation=!1,this.cache.add(o,a);n=a}else if(e.isLine){let o="LineBasicMaterial:"+n.uuid,a=this.cache.get(o);if(!a)a=new Ti,on.prototype.copy.call(a,n),a.color.copy(n.color),a.map=n.map,this.cache.add(o,a);n=a}if(i||r||s){let o="ClonedMaterial:"+n.uuid+":";if(i)o+="derivative-tangents:";if(r)o+="vertex-colors:";if(s)o+="flat-shading:";let a=this.cache.get(o);if(!a){if(a=n.clone(),r)a.vertexColors=!0;if(s)a.flatShading=!0;if(i){if(a.normalScale)a.normalScale.y*=-1;if(a.clearcoatNormalScale)a.clearcoatNormalScale.y*=-1}this.cache.add(o,a),this.associations.set(a,this.associations.get(n))}n=a}e.material=n}getMaterialType(){return Gn}loadMaterial(e){let t=this,n=this.json,i=this.extensions,r=n.materials[e],s,o={},a=r.extensions||{},c=[];if(a[Ve.KHR_MATERIALS_UNLIT]){let u=i[Ve.KHR_MATERIALS_UNLIT];s=u.getMaterialType(),c.push(u.extendParams(o,r,t))}else{let u=r.pbrMetallicRoughness||{};if(o.color=new Ie(1,1,1),o.opacity=1,Array.isArray(u.baseColorFactor)){let d=u.baseColorFactor;o.color.setRGB(d[0],d[1],d[2],nn),o.opacity=d[3]}if(u.baseColorTexture!==void 0)c.push(t.assignTexture(o,"map",u.baseColorTexture,wi));if(o.metalness=u.metallicFactor!==void 0?u.metallicFactor:1,o.roughness=u.roughnessFactor!==void 0?u.roughnessFactor:1,u.metallicRoughnessTexture!==void 0)c.push(t.assignTexture(o,"metalnessMap",u.metallicRoughnessTexture)),c.push(t.assignTexture(o,"roughnessMap",u.metallicRoughnessTexture));s=this._invokeOne(function(d){return d.getMaterialType&&d.getMaterialType(e)}),c.push(Promise.all(this._invokeAll(function(d){return d.extendMaterialParams&&d.extendMaterialParams(e,o)})))}if(r.doubleSided===!0)o.side=pn;let l=r.alphaMode||iu.OPAQUE;if(l===iu.BLEND)o.transparent=!0,o.depthWrite=!1;else if(o.transparent=!1,l===iu.MASK)o.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:0.5;if(r.normalTexture!==void 0&&s!==kn){if(c.push(t.assignTexture(o,"normalMap",r.normalTexture)),o.normalScale=new ze(1,1),r.normalTexture.scale!==void 0){let u=r.normalTexture.scale;o.normalScale.set(u,u)}}if(r.occlusionTexture!==void 0&&s!==kn){if(c.push(t.assignTexture(o,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0)o.aoMapIntensity=r.occlusionTexture.strength}if(r.emissiveFactor!==void 0&&s!==kn){let u=r.emissiveFactor;o.emissive=new Ie().setRGB(u[0],u[1],u[2],nn)}if(r.emissiveTexture!==void 0&&s!==kn)c.push(t.assignTexture(o,"emissiveMap",r.emissiveTexture,wi));return Promise.all(c).then(function(){let u=new s(o);if(r.name)u.name=r.name;if($n(u,r),t.associations.set(u,{materials:e}),r.extensions)nr(i,u,r);return u})}createUniqueName(e){let t=Qe.sanitizeNodeName(e||"");if(t in this.nodeNamesUsed)return t+"_"+ ++this.nodeNamesUsed[t];else return this.nodeNamesUsed[t]=0,t}loadGeometries(e){let t=this,n=this.extensions,i=this.primitiveCache;function r(o){return n[Ve.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(o,t).then(function(a){return Vg(a,o,t)})}let s=[];for(let o=0,a=e.length;o<a;o++){let c=e[o],l=$M(c),u=i[l];if(u)s.push(u.promise);else{let d;if(c.extensions&&c.extensions[Ve.KHR_DRACO_MESH_COMPRESSION])d=r(c);else d=Vg(new Tt,c,t);if(c.mode===xn.TRIANGLE_STRIP)d=d.then((h)=>tu(h,fs));else if(c.mode===xn.TRIANGLE_FAN)d=d.then((h)=>tu(h,Nr));i[l]={primitive:c,promise:d},s.push(d)}}return Promise.all(s)}loadMesh(e){let t=this,n=this.json,i=this.extensions,r=n.meshes[e],s=r.primitives,o=[];for(let a=0,c=s.length;a<c;a++){let l=s[a].material===void 0?HM(this.cache):this.getDependency("material",s[a].material);o.push(l)}return o.push(t.loadGeometries(s)),Promise.all(o).then(async function(a){let c=a.slice(0,a.length-1),l=a[a.length-1],u=[];for(let h=0,f=l.length;h<f;h++){let g=l[h],S=s[h],p,m=c[h];if(S.mode===xn.TRIANGLES||S.mode===xn.TRIANGLE_STRIP||S.mode===xn.TRIANGLE_FAN||S.mode===void 0){let T=r.isSkinnedMesh===!0,A=g.hasAttribute("skinIndex")&&g.hasAttribute("skinWeight");if(T&&A===!1)console.warn("THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled.");if(p=T&&A?new Ko(g,m):new vt(g,m),p.isSkinnedMesh===!0)p.normalizeSkinWeights()}else if(S.mode===xn.LINES)p=new bs(g,m);else if(S.mode===xn.LINE_STRIP)p=new Bn(g,m);else if(S.mode===xn.LINE_LOOP)p=new Qo(g,m);else if(S.mode===xn.POINTS)p=new Ur(g,m);else throw Error("THREE.GLTFLoader: Primitive mode unsupported: "+S.mode);if(Object.keys(p.geometry.morphAttributes).length>0)WM(p,r);if(p.name=t.createUniqueName(r.name||"mesh_"+e),$n(p,r),S.extensions)nr(i,p,S);t.assignFinalMaterial(p),u.push(p)}for(let h=0,f=u.length;h<f;h++)t.associations.set(u[h],{meshes:e,primitives:h});if(u.length===1){if(r.extensions)nr(i,u[0],r);return u[0]}let d=new Kt;if(r.extensions)nr(i,d,r);t.associations.set(d,{meshes:e});for(let h=0,f=u.length;h<f;h++)d.add(u[h]);return d})}loadCamera(e){let t,n=this.json.cameras[e],i=n[n.type];if(!i){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}if(n.type==="perspective")t=new Lt(mn.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2000000);else if(n.type==="orthographic")t=new er(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar);if(n.name)t.name=this.createUniqueName(n.name);return $n(t,n),Promise.resolve(t)}loadSkin(e){let t=this.json.skins[e],n=[];for(let i=0,r=t.joints.length;i<r;i++)n.push(this._loadNodeShallow(t.joints[i]));if(t.inverseBindMatrices!==void 0)n.push(this.getDependency("accessor",t.inverseBindMatrices));else n.push(null);return Promise.all(n).then(function(i){let r=i.pop(),s=i,o=[],a=[];for(let c=0,l=s.length;c<l;c++){let u=s[c];if(u){o.push(u);let d=new Oe;if(r!==null)d.fromArray(r.array,c*16);a.push(d)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[c])}return new ys(o,a)})}loadAnimation(e){let t=this.json,n=this,i=t.animations[e],r=i.name?i.name:"animation_"+e,s=[],o=[],a=[],c=[],l=[];for(let u=0,d=i.channels.length;u<d;u++){let h=i.channels[u],f=i.samplers[h.sampler],g=h.target,S=g.node,p=i.parameters!==void 0?i.parameters[f.input]:f.input,m=i.parameters!==void 0?i.parameters[f.output]:f.output;if(g.node===void 0)continue;s.push(this.getDependency("node",S)),o.push(this.getDependency("accessor",p)),a.push(this.getDependency("accessor",m)),c.push(f),l.push(g)}return Promise.all([Promise.all(s),Promise.all(o),Promise.all(a),Promise.all(c),Promise.all(l)]).then(function(u){let d=u[0],h=u[1],f=u[2],g=u[3],S=u[4],p=[];for(let T=0,A=d.length;T<A;T++){let v=d[T],w=h[T],E=f[T],R=g[T],x=S[T];if(v===void 0)continue;if(v.updateMatrix)v.updateMatrix();let M=n._createAnimationTracks(v,w,E,R,x);if(M)for(let H=0;H<M.length;H++)p.push(M[H])}let m=new ri(r,void 0,p);return $n(m,i),m})}createNodeMesh(e){let t=this.json,n=this,i=t.nodes[e];if(i.mesh===void 0)return null;return n.getDependency("mesh",i.mesh).then(function(r){let s=n._getNodeRef(n.meshCache,i.mesh,r);if(i.weights!==void 0)s.traverse(function(o){if(!o.isMesh)return;for(let a=0,c=i.weights.length;a<c;a++)o.morphTargetInfluences[a]=i.weights[a]});return s})}loadNode(e){let t=this.json,n=this,i=t.nodes[e],r=n._loadNodeShallow(e),s=[],o=i.children||[];for(let c=0,l=o.length;c<l;c++)s.push(n.getDependency("node",o[c]));let a=i.skin===void 0?Promise.resolve(null):n.getDependency("skin",i.skin);return Promise.all([r,Promise.all(s),a]).then(function(c){let l=c[0],u=c[1],d=c[2];if(d!==null)l.traverse(function(h){if(!h.isSkinnedMesh)return;h.bind(d,XM)});for(let h=0,f=u.length;h<f;h++)l.add(u[h]);if(l.userData.pivot!==void 0&&u.length>0){let h=l.userData.pivot,f=u[0];l.pivot=new O().fromArray(h),l.position.x-=h[0],l.position.y-=h[1],l.position.z-=h[2],f.position.set(0,0,0),delete l.userData.pivot}return l})}_loadNodeShallow(e){let t=this.json,n=this.extensions,i=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];let r=t.nodes[e],s=r.name?i.createUniqueName(r.name):"",o=[],a=i._invokeOne(function(c){return c.createNodeMesh&&c.createNodeMesh(e)});if(a)o.push(a);if(r.camera!==void 0)o.push(i.getDependency("camera",r.camera).then(function(c){return i._getNodeRef(i.cameraCache,r.camera,c)}));return i._invokeAll(function(c){return c.createNodeAttachment&&c.createNodeAttachment(e)}).forEach(function(c){o.push(c)}),this.nodeCache[e]=Promise.all(o).then(function(c){let l;if(r.isBone===!0)l=new xs;else if(c.length>1)l=new Kt;else if(c.length===1)l=c[0];else l=new dt;if(l!==c[0])for(let u=0,d=c.length;u<d;u++)l.add(c[u]);if(r.name)l.userData.name=r.name,l.name=s;if($n(l,r),r.extensions)nr(n,l,r);if(r.matrix!==void 0){let u=new Oe;u.fromArray(r.matrix),l.applyMatrix4(u)}else{if(r.translation!==void 0)l.position.fromArray(r.translation);if(r.rotation!==void 0)l.quaternion.fromArray(r.rotation);if(r.scale!==void 0)l.scale.fromArray(r.scale)}if(!i.associations.has(l))i.associations.set(l,{});else if(r.mesh!==void 0&&i.meshCache.refs[r.mesh]>1){let u=i.associations.get(l);i.associations.set(l,{...u})}return i.associations.get(l).nodes=e,l}),this.nodeCache[e]}loadScene(e){let t=this.extensions,n=this.json.scenes[e],i=this,r=new Kt;if(n.name)r.name=i.createUniqueName(n.name);if($n(r,n),n.extensions)nr(t,r,n);let s=n.nodes||[],o=[];for(let a=0,c=s.length;a<c;a++)o.push(i.getDependency("node",s[a]));return Promise.all(o).then(function(a){for(let l=0,u=a.length;l<u;l++){let d=a[l];if(d.parent!==null)r.add(zg(d));else r.add(d)}let c=(l)=>{let u=new Map;for(let[d,h]of i.associations)if(d instanceof on||d instanceof St)u.set(d,h);return l.traverse((d)=>{let h=i.associations.get(d);if(h!=null)u.set(d,h)}),u};return i.associations=c(r),r})}_createAnimationTracks(e,t,n,i,r){let s=[],o=e.name?e.name:e.uuid,a=[];function c(h){if(h.morphTargetInfluences)a.push(h.name?h.name:h.uuid)}if(Pi[r.path]===Pi.weights){if(c(e),e.isGroup)e.children.forEach(c)}else a.push(o);let l;switch(Pi[r.path]){case Pi.weights:l=Ri;break;case Pi.rotation:l=An;break;case Pi.translation:case Pi.scale:l=Hn;break;default:switch(n.itemSize){case 1:l=Ri;break;case 2:case 3:default:l=Hn;break}break}let u=i.interpolation!==void 0?GM[i.interpolation]:Wo,d=this._getArrayFromAccessor(n);for(let h=0,f=a.length;h<f;h++){let g=new l(a[h]+"."+Pi[r.path],t.array,d,u);if(i.interpolation==="CUBICSPLINE")this._createCubicSplineTrackInterpolant(g);s.push(g)}return s}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){let n=au(t.constructor),i=new Float32Array(t.length);for(let r=0,s=t.length;r<s;r++)i[r]=t[r]*n;t=i}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(n){return new(this instanceof An?d_:lu)(this.times,this.values,this.getValueSize()/3,n)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function qM(e,t,n){let i=t.attributes,r=new gn;if(i.POSITION!==void 0){let a=n.json.accessors[i.POSITION],{min:c,max:l}=a;if(c!==void 0&&l!==void 0){if(r.set(new O(c[0],c[1],c[2]),new O(l[0],l[1],l[2])),a.normalized){let u=au(Gr[a.componentType]);r.min.multiplyScalar(u),r.max.multiplyScalar(u)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;let s=t.targets;if(s!==void 0){let a=new O,c=new O;for(let l=0,u=s.length;l<u;l++){let d=s[l];if(d.POSITION!==void 0){let h=n.json.accessors[d.POSITION],{min:f,max:g}=h;if(f!==void 0&&g!==void 0){if(c.setX(Math.max(Math.abs(f[0]),Math.abs(g[0]))),c.setY(Math.max(Math.abs(f[1]),Math.abs(g[1]))),c.setZ(Math.max(Math.abs(f[2]),Math.abs(g[2]))),h.normalized){let S=au(Gr[h.componentType]);c.multiplyScalar(S)}a.max(c)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}r.expandByVector(a)}e.boundingBox=r;let o=new sn;r.getCenter(o.center),o.radius=r.min.distanceTo(r.max)/2,e.boundingSphere=o}function Vg(e,t,n){let i=t.attributes,r=[];function s(o,a){return n.getDependency("accessor",o).then(function(c){e.setAttribute(a,c)})}for(let o in i){let a=ou[o]||o.toLowerCase();if(a in e.attributes)continue;r.push(s(i[o],a))}if(t.indices!==void 0&&!e.index){let o=n.getDependency("accessor",t.indices).then(function(a){e.setIndex(a)});r.push(o)}if(He.workingColorSpace!==nn&&"COLOR_0"in i)console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${He.workingColorSpace}" not supported.`);return $n(e,t),qM(e,t,n),Promise.all(r).then(function(){return t.targets!==void 0?VM(e,t.targets,n):e})}function uu(e,t,n){if(!e.length)return n;let i=[...e].sort((c,l)=>c.time-l.time);if(t<=i[0].time)return{...i[0],time:t};let r=i.findIndex((c)=>c.time>t);if(r<0)return{...i.at(-1)||n,time:t};let s=i[r-1],o=i[r],a=(t-s.time)/(o.time-s.time);return{time:t,x:s.x+(o.x-s.x)*a,y:s.y+(o.y-s.y)*a,z:s.z+(o.z-s.z)*a,yaw:s.yaw+(o.yaw-s.yaw)*a}}function p_(e,t,n,i={}){let r=t.advanced||{models:[],tracks:[],showPaths:!0},s=i.translate||((N)=>N),o=0,a=!1,c=new qo;c.background=new Ie("#14191f");let l=i.width||640,u=i.height||360,d=new Lt(t.camera.fov,l/u,0.1,200);d.name="__camera__",c.add(d);let h;try{h=new eu({antialias:!0,preserveDrawingBuffer:!0})}catch{throw Error(s("WebGL is unavailable; use simple composition"))}h.setSize(l,u),h.domElement.style.width="100%",h.domElement.style.height="auto",e.appendChild(h.domElement),c.add(new sa(16777215,3359829,2));let f=new Fr(16777215,3);f.position.set(5,8,4),c.add(f),c.add(new da(20,20,7372944,3029832));let g=new Map,S=[],p=[],m=new Map;for(let N of t.actors){let C=new Kt;C.name=N.id;let F=new Gn({color:N.color}),V=new vt(new ji(0.2,0.8,4,8),F);V.position.y=N.pose==="sit"?0.65:1,C.add(V);let G=new vt(new Ts(0.17,12,8),F);G.position.y=N.pose==="sit"?1.05:1.7,C.add(G);for(let ie of[-1,1]){let X=new Kt;X.name=ie<0?"left_arm":"right_arm",X.position.set(ie*0.3,N.pose==="sit"?0.95:1.4,0);let Q=new vt(new ji(0.07,0.35,4,6),F);Q.position.y=-0.22,X.add(Q),C.add(X);let ee=new Kt;ee.name=ie<0?"left_leg":"right_leg",ee.position.set(ie*0.12,N.pose==="sit"?0.6:0.75,0);let ve=new vt(new ji(0.08,0.55,4,6),F);ve.position.y=-0.28,ee.add(ve),C.add(ee)}c.add(C),g.set(N.id,C),m.set(N.id,{time:0,x:N.x,y:0,z:N.z,yaw:N.yaw})}for(let N of t.props){let C=new vt(new Ei(N.width,N.height,N.depth),new Gn({color:N.color}));C.name=N.id,c.add(C),g.set(N.id,C),m.set(N.id,{time:0,x:N.x,y:N.height/2,z:N.z,yaw:0})}for(let N of r.tracks){if(N.targetId==="__camera__")continue;let C=[...N.keys].sort((F,V)=>F.time-V.time);if(C.length<2)continue;if(p.push(new ri(N.targetId,t.duration,[new Hn(`${N.targetId}.position`,C.map((F)=>F.time),C.flatMap((F)=>[F.x,F.y,F.z])),new An(`${N.targetId}.quaternion`,C.map((F)=>F.time),C.flatMap((F)=>new Gt().setFromAxisAngle(new O(0,1,0),mn.degToRad(F.yaw)).toArray()))])),r.showPaths)c.add(new Bn(new Tt().setFromPoints(C.map((F)=>new O(F.x,F.y,F.z))),new Ti({color:56831})))}let T=(N)=>{o=N;let C=N/t.duration;for(let[X,Q]of g){let ee=m.get(X);if(!ee)continue;let ve=t.actors.find((qe)=>qe.id===X);if(ve)ee={...ee,x:ve.x+(ve.endX-ve.x)*C,z:ve.z+(ve.endZ-ve.z)*C};let Ee=uu(r.tracks.find((qe)=>qe.targetId===X)?.keys||[],N,ee);if(Q.position.set(Ee.x,Ee.y,Ee.z),Q.rotation.y=mn.degToRad(Ee.yaw),ve){let qe=ve.pose==="walk"?Math.sin(N*8)*0.5:0,ke=Q.getObjectByName("left_arm"),q=Q.getObjectByName("right_arm"),re=Q.getObjectByName("left_leg"),se=Q.getObjectByName("right_leg");if(ke)ke.rotation.set(qe,0,0);if(q){if(q.rotation.set(-qe,0,0),ve.pose==="wave")q.rotation.z=2.8+Math.sin(N*8)*0.15;if(ve.pose==="point")q.rotation.x=-Math.PI/2}if(re)re.rotation.x=ve.pose==="sit"?-Math.PI/2:-qe;if(se)se.rotation.x=ve.pose==="sit"?-Math.PI/2:qe}}for(let X of S)X.setTime(N);let F=uu(r.tracks.find((X)=>X.targetId==="__camera__")?.keys||[],N,{time:N,x:0,y:0,z:0,yaw:t.camera.yaw+(t.camera.endYaw-t.camera.yaw)*C}),V=mn.degToRad(F.yaw),G=mn.degToRad(t.camera.pitch),ie=g.get(r.followId||"")?.position||new O;d.position.set(Math.sin(V)*t.camera.distance*Math.cos(G)+ie.x+F.x,Math.sin(G)*t.camera.distance+1+ie.y+F.y,Math.cos(V)*t.camera.distance*Math.cos(G)+ie.z+F.z),d.lookAt(g.get(r.lookAtId||"")?.position.clone().add(new O(0,1,0))||ie.clone().add(new O(0,1,0))),h.render(c,d)},A=[...new Set([0,t.duration,...r.tracks.find((N)=>N.targetId==="__camera__")?.keys.map((N)=>N.time)||[]])].sort((N,C)=>N-C),v=[],w=[];for(let N of A)T(N),v.push(...d.position.toArray()),w.push(...d.quaternion.toArray());p.push(new ri("Camera movement",t.duration,[new Hn("__camera__.position",A,v),new An("__camera__.quaternion",A,w)]));let E={renderer:h,scene:c,camera:d,update:T,clips:p,ready:Promise.resolve()};T(o);let R=new As;R.setURLModifier((N)=>{if(!N.startsWith("data:")&&!N.startsWith("blob:"))throw Error("GLB external resources are not supported");return N});let x=new cu(R),M=Promise.all(r.models.map(async(N)=>{let C=await n(N.modelMediaId);if(!C)throw Error(s("Stored 3D model is unavailable"));let F=await x.parseAsync(await C.arrayBuffer(),"");if(a)return;let V=F.scene;if(V.name=N.id,V.scale.setScalar(N.scale),V.rotation.set(mn.degToRad(N.pitch||0),mn.degToRad(N.yaw||0),mn.degToRad(N.roll||0)),c.add(V),g.set(N.id,V),m.set(N.id,{time:0,x:N.x,y:N.y,z:N.z,yaw:N.yaw||0}),F.animations.length&&N.animation!=="__none__"){let G=new ua(V),ie=F.animations.find((X)=>X.name===N.animation)||F.animations[0];G.clipAction(ie).play(),S.push(G),p.push(...F.animations)}i.onAnimations?.(N.id,F.animations.map((G)=>G.name)),T(o)}));E.ready=M,M.catch((N)=>{if(!a)i.onError?.(String(N))});let H=()=>{a=!0,h.dispose(),e.replaceChildren(),c.traverse((N)=>{if(N instanceof vt||N instanceof Bn)N.geometry.dispose(),(Array.isArray(N.material)?N.material:[N.material]).forEach((F)=>{for(let V of Object.values(F))if(V instanceof St)V.dispose();F.dispose()})}),S.forEach((N)=>N.stopAllAction())},U=new ha,z=new dn(new O(0,1,0),0);return{...E,dispose:H,time:()=>o,pick:(N,C)=>{U.setFromCamera(new ze(N*2-1,1-C*2),d);let F=U.intersectObjects([...g.values()],!0)[0];if(!F)return null;let V=F.object;while(V&&g.get(V.name)!==V)V=V.parent;return V?{id:V.name,x:V.position.x,y:V.position.y,z:V.position.z,yaw:mn.radToDeg(V.rotation.y)}:null},ground:(N,C)=>{U.setFromCamera(new ze(N*2-1,1-C*2),d);let F=U.ray.intersectPlane(z,new O);return F?{x:F.x,z:F.z}:null},moveObject:(N,C,F)=>{let V=g.get(N);if(!V)return;V.position.x=C,V.position.z=F,h.render(c,d)}}}function m_(e,t,n,i="color"){let r=e.time(),s=e.scene.overrideMaterial,o=e.scene.background,a=e.camera.far,c=[],l;try{if(e.update(n),i!=="color"){if(e.scene.traverse((u)=>{if((u instanceof Bn||u instanceof Ur)&&u.visible)c.push(u),u.visible=!1}),e.camera.far=Math.max(e.camera.near+1,t.camera.distance*2+10),e.camera.updateProjectionMatrix(),l=i==="whitebox"?new Gn({color:"#ffffff",roughness:1,metalness:0}):new Es({depthPacking:xl}),i==="depth")l.onBeforeCompile=(u)=>{u.uniforms.studioDepthNear={value:e.camera.near},u.uniforms.studioDepthFar={value:e.camera.far},u.fragmentShader=`uniform float studioDepthNear;uniform float studioDepthFar;
${u.fragmentShader.replace("1.0 - fragCoordZ","clamp(1.0-(-perspectiveDepthToViewZ(fragCoordZ,studioDepthNear,studioDepthFar)-studioDepthNear)/(studioDepthFar-studioDepthNear),0.0,1.0)")}`},l.customProgramCacheKey=()=>"studio-linear-camera-depth";e.scene.overrideMaterial=l,e.scene.background=new Ie(i==="whitebox"?"#888888":"#000000"),e.renderer.render(e.scene,e.camera)}return e.renderer.domElement.toDataURL("image/png")}finally{c.forEach((u)=>{u.visible=!0}),e.camera.far=a,e.camera.updateProjectionMatrix(),e.scene.overrideMaterial=s,e.scene.background=o,l?.dispose(),e.update(r)}}var ln=window;try{if(ln.studioGraphicsInput){let e=ln.studioGraphicsInput,t=pi(lp).max(50).parse(e.items),n=document.createElement("canvas");n.width=e.width,n.height=e.height,document.body.appendChild(n),ln.studioPrevisCapture=async(i)=>{let r=n.getContext("2d");if(!r)throw Error("Graphic canvas is unavailable");let s=new Image,o=cp(t,i,e.width,e.height,e.images);return s.src=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(o)))}`,await s.decode(),r.clearRect(0,0,e.width,e.height),r.drawImage(s,0,0),n.toDataURL("image/png")},ln.studioPrevisReady=!0}else{let e=up.parse(ln.studioPrevisInput.scene),t=p_(document.body,e,async(n)=>{let i=ln.studioPrevisInput.models[n];if(!i)throw Error("Stored 3D model is unavailable");let r=Uint8Array.from(atob(i),(s)=>s.charCodeAt(0));return new Blob([r],{type:"model/gltf-binary"})},{width:Xe().int().min(64).max(4096).parse(ln.studioPrevisInput.width||640),height:Xe().int().min(64).max(4096).parse(ln.studioPrevisInput.height||360),onError:(n)=>{ln.studioPrevisError=n}});ln.studioPrevisCapture=(n,i)=>m_(t,e,n,i),t.ready.then(()=>{ln.studioPrevisReady=!0}).catch((n)=>{ln.studioPrevisError=String(n)})}}catch(e){ln.studioPrevisError=String(e)}})();
