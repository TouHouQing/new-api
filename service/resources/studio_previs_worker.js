(()=>{var Du;function K(e,t,n){function i(a,c){if(!a._zod)Object.defineProperty(a,"_zod",{value:{def:c,constr:o,traits:new Set},enumerable:!1});if(a._zod.traits.has(e))return;a._zod.traits.add(e),t(a,c);let l=o.prototype,u=Object.keys(l);for(let d=0;d<u.length;d++){let h=u[d];if(!(h in a))a[h]=l[h].bind(a)}}let r=n?.Parent??Object;class s extends r{}Object.defineProperty(s,"name",{value:e});function o(a){var c;let l=n?.Parent?new s:this;i(l,a),(c=l._zod).deferred??(c.deferred=[]);for(let u of l._zod.deferred)u();return l}return Object.defineProperty(o,"init",{value:i}),Object.defineProperty(o,Symbol.hasInstance,{value:(a)=>{if(n?.Parent&&a instanceof n.Parent)return!0;return a?._zod?.traits?.has(e)}}),Object.defineProperty(o,"name",{value:e}),o}var dw=Symbol("zod_brand");class Xn extends Error{constructor(){super("Encountered Promise during synchronous parse. Use .parseAsync() instead.")}}class Jr extends Error{constructor(e){super(`Encountered unidirectional transform during encode: ${e}`);this.name="ZodEncodeError"}}(Du=globalThis).__zod_globalConfig??(Du.__zod_globalConfig={});var cr=globalThis.__zod_globalConfig;function qn(e){if(e)Object.assign(cr,e);return cr}function Ys(e){let t=Object.values(e).filter((i)=>typeof i==="number");return Object.entries(e).filter(([i,r])=>t.indexOf(+i)===-1).map(([i,r])=>r)}function jr(e,t){if(typeof t==="bigint")return t.toString();return t}function Js(e){return{get value(){{let n=e();return Object.defineProperty(this,"value",{value:n}),n}throw Error("cached value already set")}}}function Ks(e){return e===null||e===void 0}function js(e){let t=e.startsWith("^")?1:0,n=e.endsWith("$")?e.length-1:e.length;return e.slice(t,n)}function Ou(e,t){let n=e/t,i=Math.round(n),r=Number.EPSILON*Math.max(Math.abs(n),1);if(Math.abs(n-i)<r)return 0;return n-i}var Uu=Symbol("evaluating");function rt(e,t,n){let i=void 0;Object.defineProperty(e,t,{get(){if(i===Uu)return;if(i===void 0)i=Uu,i=n();return i},set(r){Object.defineProperty(e,t,{value:r})},configurable:!0})}function Ui(e,t,n){Object.defineProperty(e,t,{value:n,writable:!0,enumerable:!0,configurable:!0})}function hi(...e){let t={};for(let n of e){let i=Object.getOwnPropertyDescriptors(n);Object.assign(t,i)}return Object.defineProperties({},t)}function Pa(e){return JSON.stringify(e)}function Fu(e){return e.toLowerCase().trim().replace(/[^\w\s-]/g,"").replace(/[\s_-]+/g,"-").replace(/^-+|-+$/g,"")}var La="captureStackTrace"in Error?Error.captureStackTrace:(...e)=>{};function Kr(e){return typeof e==="object"&&e!==null&&!Array.isArray(e)}var zu=Js(()=>{if(cr.jitless)return!1;if(typeof navigator<"u"&&navigator?.userAgent?.includes("Cloudflare"))return!1;try{return new Function(""),!0}catch(e){return!1}});function lr(e){if(Kr(e)===!1)return!1;let t=e.constructor;if(t===void 0)return!0;if(typeof t!=="function")return!0;let n=t.prototype;if(Kr(n)===!1)return!1;if(Object.prototype.hasOwnProperty.call(n,"isPrototypeOf")===!1)return!1;return!0}function Na(e){if(lr(e))return{...e};if(Array.isArray(e))return[...e];if(e instanceof Map)return new Map(e);if(e instanceof Set)return new Set(e);return e}var ku=new Set(["string","number","symbol"]);function ur(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function Pn(e,t,n){let i=new e._zod.constr(t??e._zod.def);if(!t||n?.parent)i._zod.parent=e;return i}function Ae(e){let t=e;if(!t)return{};if(typeof t==="string")return{error:()=>t};if(t?.message!==void 0){if(t?.error!==void 0)throw Error("Cannot specify both `message` and `error` params");t.error=t.message}if(delete t.message,typeof t.error==="string")return{...t,error:()=>t.error};return t}function Bu(e){return Object.keys(e).filter((t)=>e[t]._zod.optin==="optional"&&e[t]._zod.optout==="optional")}var Gu={safeint:[Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER],int32:[-2147483648,2147483647],uint32:[0,4294967295],float32:[-340282346638528860000000000000000000000,340282346638528860000000000000000000000],float64:[-Number.MAX_VALUE,Number.MAX_VALUE]};function k_(e,t){let n=e._zod.def,i=n.checks;if(i&&i.length>0)throw Error(".pick() cannot be used on object schemas containing refinements");let s=hi(e._zod.def,{get shape(){let o={};for(let a in t){if(!(a in n.shape))throw Error(`Unrecognized key: "${a}"`);if(!t[a])continue;o[a]=n.shape[a]}return Ui(this,"shape",o),o},checks:[]});return Pn(e,s)}function B_(e,t){let n=e._zod.def,i=n.checks;if(i&&i.length>0)throw Error(".omit() cannot be used on object schemas containing refinements");let s=hi(e._zod.def,{get shape(){let o={...e._zod.def.shape};for(let a in t){if(!(a in n.shape))throw Error(`Unrecognized key: "${a}"`);if(!t[a])continue;delete o[a]}return Ui(this,"shape",o),o},checks:[]});return Pn(e,s)}function G_(e,t){if(!lr(t))throw Error("Invalid input to extend: expected a plain object");let n=e._zod.def.checks;if(n&&n.length>0){let s=e._zod.def.shape;for(let o in t)if(Object.getOwnPropertyDescriptor(s,o)!==void 0)throw Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.")}let r=hi(e._zod.def,{get shape(){let s={...e._zod.def.shape,...t};return Ui(this,"shape",s),s}});return Pn(e,r)}function H_(e,t){if(!lr(t))throw Error("Invalid input to safeExtend: expected a plain object");let n=hi(e._zod.def,{get shape(){let i={...e._zod.def.shape,...t};return Ui(this,"shape",i),i}});return Pn(e,n)}function V_(e,t){if(e._zod.def.checks?.length)throw Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");let n=hi(e._zod.def,{get shape(){let i={...e._zod.def.shape,...t._zod.def.shape};return Ui(this,"shape",i),i},get catchall(){return t._zod.def.catchall},checks:t._zod.def.checks??[]});return Pn(e,n)}function W_(e,t,n){let r=t._zod.def.checks;if(r&&r.length>0)throw Error(".partial() cannot be used on object schemas containing refinements");let o=hi(t._zod.def,{get shape(){let a=t._zod.def.shape,c={...a};if(n)for(let l in n){if(!(l in a))throw Error(`Unrecognized key: "${l}"`);if(!n[l])continue;c[l]=e?new e({type:"optional",innerType:a[l]}):a[l]}else for(let l in a)c[l]=e?new e({type:"optional",innerType:a[l]}):a[l];return Ui(this,"shape",c),c},checks:[]});return Pn(t,o)}function $_(e,t,n){let i=hi(t._zod.def,{get shape(){let r=t._zod.def.shape,s={...r};if(n)for(let o in n){if(!(o in s))throw Error(`Unrecognized key: "${o}"`);if(!n[o])continue;s[o]=new e({type:"nonoptional",innerType:r[o]})}else for(let o in r)s[o]=new e({type:"nonoptional",innerType:r[o]});return Ui(this,"shape",s),s}});return Pn(t,i)}function Oi(e,t=0){if(e.aborted===!0)return!0;for(let n=t;n<e.issues.length;n++)if(e.issues[n]?.continue!==!0)return!0;return!1}function Hu(e,t=0){if(e.aborted===!0)return!0;for(let n=t;n<e.issues.length;n++)if(e.issues[n]?.continue===!1)return!0;return!1}function Qs(e,t){return t.map((n)=>{var i;return(i=n).path??(i.path=[]),n.path.unshift(e),n})}function qs(e){return typeof e==="string"?e:e?.message}function Yn(e,t,n){let i=e.message?e.message:qs(e.inst?._zod.def?.error?.(e))??qs(t?.error?.(e))??qs(n.customError?.(e))??qs(n.localeError?.(e))??"Invalid input",{inst:r,continue:s,input:o,...a}=e;if(a.path??(a.path=[]),a.message=i,t?.reportInput)a.input=o;return a}function eo(e){if(Array.isArray(e))return"array";if(typeof e==="string")return"string";return"unknown"}function Fi(...e){let[t,n,i]=e;if(typeof t==="string")return{message:t,code:"custom",input:n,inst:i};return{...t}}var Vu=(e,t)=>{e.name="$ZodError",Object.defineProperty(e,"_zod",{value:e._zod,enumerable:!1}),Object.defineProperty(e,"issues",{value:t,enumerable:!1}),e.message=JSON.stringify(t,jr,2),Object.defineProperty(e,"toString",{value:()=>e.message,enumerable:!1})},to=K("$ZodError",Vu),Da=K("$ZodError",Vu,{Parent:Error});function Wu(e,t=(n)=>n.message){let n={},i=[];for(let r of e.issues)if(r.path.length>0)n[r.path[0]]=n[r.path[0]]||[],n[r.path[0]].push(t(r));else i.push(t(r));return{formErrors:i,fieldErrors:n}}function $u(e,t=(n)=>n.message){let n={_errors:[]},i=(r,s=[])=>{for(let o of r.issues)if(o.code==="invalid_union"&&o.errors.length)o.errors.map((a)=>i({issues:a},[...s,...o.path]));else if(o.code==="invalid_key")i({issues:o.issues},[...s,...o.path]);else if(o.code==="invalid_element")i({issues:o.issues},[...s,...o.path]);else{let a=[...s,...o.path];if(a.length===0)n._errors.push(t(o));else{let c=n,l=0;while(l<a.length){let u=a[l];if(l!==a.length-1)c[u]=c[u]||{_errors:[]};else c[u]=c[u]||{_errors:[]},c[u]._errors.push(t(o));c=c[u],l++}}}};return i(e),n}var no=(e)=>(t,n,i,r)=>{let s=i?{...i,async:!1}:{async:!1},o=t._zod.run({value:n,issues:[]},s);if(o instanceof Promise)throw new Xn;if(o.issues.length){let a=new(r?.Err??e)(o.issues.map((c)=>Yn(c,s,qn())));throw La(a,r?.callee),a}return o.value};var io=(e)=>async(t,n,i,r)=>{let s=i?{...i,async:!0}:{async:!0},o=t._zod.run({value:n,issues:[]},s);if(o instanceof Promise)o=await o;if(o.issues.length){let a=new(r?.Err??e)(o.issues.map((c)=>Yn(c,s,qn())));throw La(a,r?.callee),a}return o.value};var Qr=(e)=>(t,n,i)=>{let r=i?{...i,async:!1}:{async:!1},s=t._zod.run({value:n,issues:[]},r);if(s instanceof Promise)throw new Xn;return s.issues.length?{success:!1,error:new(e??to)(s.issues.map((o)=>Yn(o,r,qn())))}:{success:!0,data:s.value}},Zu=Qr(Da),es=(e)=>async(t,n,i)=>{let r=i?{...i,async:!0}:{async:!0},s=t._zod.run({value:n,issues:[]},r);if(s instanceof Promise)s=await s;return s.issues.length?{success:!1,error:new e(s.issues.map((o)=>Yn(o,r,qn())))}:{success:!0,data:s.value}},Xu=es(Da),qu=(e)=>(t,n,i)=>{let r=i?{...i,direction:"backward"}:{direction:"backward"};return no(e)(t,n,r)};var Yu=(e)=>(t,n,i)=>no(e)(t,n,i);var Ju=(e)=>async(t,n,i)=>{let r=i?{...i,direction:"backward"}:{direction:"backward"};return io(e)(t,n,r)};var Ku=(e)=>async(t,n,i)=>io(e)(t,n,i);var ju=(e)=>(t,n,i)=>{let r=i?{...i,direction:"backward"}:{direction:"backward"};return Qr(e)(t,n,r)};var Qu=(e)=>(t,n,i)=>Qr(e)(t,n,i);var eh=(e)=>async(t,n,i)=>{let r=i?{...i,direction:"backward"}:{direction:"backward"};return es(e)(t,n,r)};var th=(e)=>async(t,n,i)=>es(e)(t,n,i);var nh=/^[cC][0-9a-z]{6,}$/,ih=/^[0-9a-z]+$/,rh=/^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/,sh=/^[0-9a-vA-V]{20}$/,oh=/^[A-Za-z0-9]{27}$/,ah=/^[a-zA-Z0-9_-]{21}$/,ch=/^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;var lh=/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,Ua=(e)=>{if(!e)return/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`)};var uh=/^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;var X_="^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";function hh(){return new RegExp(X_,"u")}var dh=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,fh=/^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;var ph=/^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/,mh=/^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,gh=/^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/,Oa=/^[A-Za-z0-9_-]*$/;var _h=/^https?$/,xh=/^\+[1-9]\d{6,14}$/,vh="(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))",yh=new RegExp(`^${vh}$`);function Sh(e){return typeof e.precision==="number"?e.precision===-1?"(?:[01]\\d|2[0-3]):[0-5]\\d":e.precision===0?"(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d":`(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{${e.precision}}`:"(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?"}function bh(e){return new RegExp(`^${Sh(e)}$`)}function Mh(e){let t=Sh({precision:e.precision}),n=["Z"];if(e.local)n.push("");if(e.offset)n.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");let i=`${t}(?:${n.join("|")})`;return new RegExp(`^${vh}T(?:${i})$`)}var wh=(e)=>{let t=e?`[\\s\\S]{${e?.minimum??0},${e?.maximum??""}}`:"[\\s\\S]*";return new RegExp(`^${t}$`)};var Th=/^-?\d+$/,Eh=/^-?\d+(?:\.\d+)?$/,Ah=/^(?:true|false)$/i;var Rh=/^[^A-Z]*$/,Ch=/^[^a-z]*$/;var Bt=K("$ZodCheck",(e,t)=>{var n;e._zod??(e._zod={}),e._zod.def=t,(n=e._zod).onattach??(n.onattach=[])}),Ih={number:"number",bigint:"bigint",object:"date"},Fa=K("$ZodCheckLessThan",(e,t)=>{Bt.init(e,t);let n=Ih[typeof t.value];e._zod.onattach.push((i)=>{let r=i._zod.bag,s=(t.inclusive?r.maximum:r.exclusiveMaximum)??Number.POSITIVE_INFINITY;if(t.value<s)if(t.inclusive)r.maximum=t.value;else r.exclusiveMaximum=t.value}),e._zod.check=(i)=>{if(t.inclusive?i.value<=t.value:i.value<t.value)return;i.issues.push({origin:n,code:"too_big",maximum:typeof t.value==="object"?t.value.getTime():t.value,input:i.value,inclusive:t.inclusive,inst:e,continue:!t.abort})}}),za=K("$ZodCheckGreaterThan",(e,t)=>{Bt.init(e,t);let n=Ih[typeof t.value];e._zod.onattach.push((i)=>{let r=i._zod.bag,s=(t.inclusive?r.minimum:r.exclusiveMinimum)??Number.NEGATIVE_INFINITY;if(t.value>s)if(t.inclusive)r.minimum=t.value;else r.exclusiveMinimum=t.value}),e._zod.check=(i)=>{if(t.inclusive?i.value>=t.value:i.value>t.value)return;i.issues.push({origin:n,code:"too_small",minimum:typeof t.value==="object"?t.value.getTime():t.value,input:i.value,inclusive:t.inclusive,inst:e,continue:!t.abort})}}),Ph=K("$ZodCheckMultipleOf",(e,t)=>{Bt.init(e,t),e._zod.onattach.push((n)=>{var i;(i=n._zod.bag).multipleOf??(i.multipleOf=t.value)}),e._zod.check=(n)=>{if(typeof n.value!==typeof t.value)throw Error("Cannot mix number and bigint in multiple_of check.");if(typeof n.value==="bigint"?n.value%t.value===BigInt(0):Ou(n.value,t.value)===0)return;n.issues.push({origin:typeof n.value,code:"not_multiple_of",divisor:t.value,input:n.value,inst:e,continue:!t.abort})}}),Lh=K("$ZodCheckNumberFormat",(e,t)=>{Bt.init(e,t),t.format=t.format||"float64";let n=t.format?.includes("int"),i=n?"int":"number",[r,s]=Gu[t.format];e._zod.onattach.push((o)=>{let a=o._zod.bag;if(a.format=t.format,a.minimum=r,a.maximum=s,n)a.pattern=Th}),e._zod.check=(o)=>{let a=o.value;if(n){if(!Number.isInteger(a)){o.issues.push({expected:i,format:t.format,code:"invalid_type",continue:!1,input:a,inst:e});return}if(!Number.isSafeInteger(a)){if(a>0)o.issues.push({input:a,code:"too_big",maximum:Number.MAX_SAFE_INTEGER,note:"Integers must be within the safe integer range.",inst:e,origin:i,inclusive:!0,continue:!t.abort});else o.issues.push({input:a,code:"too_small",minimum:Number.MIN_SAFE_INTEGER,note:"Integers must be within the safe integer range.",inst:e,origin:i,inclusive:!0,continue:!t.abort});return}}if(a<r)o.issues.push({origin:"number",input:a,code:"too_small",minimum:r,inclusive:!0,inst:e,continue:!t.abort});if(a>s)o.issues.push({origin:"number",input:a,code:"too_big",maximum:s,inclusive:!0,inst:e,continue:!t.abort})}});var Nh=K("$ZodCheckMaxLength",(e,t)=>{var n;Bt.init(e,t),(n=e._zod.def).when??(n.when=(i)=>{let r=i.value;return!Ks(r)&&r.length!==void 0}),e._zod.onattach.push((i)=>{let r=i._zod.bag.maximum??Number.POSITIVE_INFINITY;if(t.maximum<r)i._zod.bag.maximum=t.maximum}),e._zod.check=(i)=>{let r=i.value;if(r.length<=t.maximum)return;let o=eo(r);i.issues.push({origin:o,code:"too_big",maximum:t.maximum,inclusive:!0,input:r,inst:e,continue:!t.abort})}}),Dh=K("$ZodCheckMinLength",(e,t)=>{var n;Bt.init(e,t),(n=e._zod.def).when??(n.when=(i)=>{let r=i.value;return!Ks(r)&&r.length!==void 0}),e._zod.onattach.push((i)=>{let r=i._zod.bag.minimum??Number.NEGATIVE_INFINITY;if(t.minimum>r)i._zod.bag.minimum=t.minimum}),e._zod.check=(i)=>{let r=i.value;if(r.length>=t.minimum)return;let o=eo(r);i.issues.push({origin:o,code:"too_small",minimum:t.minimum,inclusive:!0,input:r,inst:e,continue:!t.abort})}}),Uh=K("$ZodCheckLengthEquals",(e,t)=>{var n;Bt.init(e,t),(n=e._zod.def).when??(n.when=(i)=>{let r=i.value;return!Ks(r)&&r.length!==void 0}),e._zod.onattach.push((i)=>{let r=i._zod.bag;r.minimum=t.length,r.maximum=t.length,r.length=t.length}),e._zod.check=(i)=>{let r=i.value,s=r.length;if(s===t.length)return;let o=eo(r),a=s>t.length;i.issues.push({origin:o,...a?{code:"too_big",maximum:t.length}:{code:"too_small",minimum:t.length},inclusive:!0,exact:!0,input:i.value,inst:e,continue:!t.abort})}}),ts=K("$ZodCheckStringFormat",(e,t)=>{var n,i;if(Bt.init(e,t),e._zod.onattach.push((r)=>{let s=r._zod.bag;if(s.format=t.format,t.pattern)s.patterns??(s.patterns=new Set),s.patterns.add(t.pattern)}),t.pattern)(n=e._zod).check??(n.check=(r)=>{if(t.pattern.lastIndex=0,t.pattern.test(r.value))return;r.issues.push({origin:"string",code:"invalid_format",format:t.format,input:r.value,...t.pattern?{pattern:t.pattern.toString()}:{},inst:e,continue:!t.abort})});else(i=e._zod).check??(i.check=()=>{})}),Oh=K("$ZodCheckRegex",(e,t)=>{ts.init(e,t),e._zod.check=(n)=>{if(t.pattern.lastIndex=0,t.pattern.test(n.value))return;n.issues.push({origin:"string",code:"invalid_format",format:"regex",input:n.value,pattern:t.pattern.toString(),inst:e,continue:!t.abort})}}),Fh=K("$ZodCheckLowerCase",(e,t)=>{t.pattern??(t.pattern=Rh),ts.init(e,t)}),zh=K("$ZodCheckUpperCase",(e,t)=>{t.pattern??(t.pattern=Ch),ts.init(e,t)}),kh=K("$ZodCheckIncludes",(e,t)=>{Bt.init(e,t);let n=ur(t.includes),i=new RegExp(typeof t.position==="number"?`^.{${t.position}}${n}`:n);t.pattern=i,e._zod.onattach.push((r)=>{let s=r._zod.bag;s.patterns??(s.patterns=new Set),s.patterns.add(i)}),e._zod.check=(r)=>{if(r.value.includes(t.includes,t.position))return;r.issues.push({origin:"string",code:"invalid_format",format:"includes",includes:t.includes,input:r.value,inst:e,continue:!t.abort})}}),Bh=K("$ZodCheckStartsWith",(e,t)=>{Bt.init(e,t);let n=new RegExp(`^${ur(t.prefix)}.*`);t.pattern??(t.pattern=n),e._zod.onattach.push((i)=>{let r=i._zod.bag;r.patterns??(r.patterns=new Set),r.patterns.add(n)}),e._zod.check=(i)=>{if(i.value.startsWith(t.prefix))return;i.issues.push({origin:"string",code:"invalid_format",format:"starts_with",prefix:t.prefix,input:i.value,inst:e,continue:!t.abort})}}),Gh=K("$ZodCheckEndsWith",(e,t)=>{Bt.init(e,t);let n=new RegExp(`.*${ur(t.suffix)}$`);t.pattern??(t.pattern=n),e._zod.onattach.push((i)=>{let r=i._zod.bag;r.patterns??(r.patterns=new Set),r.patterns.add(n)}),e._zod.check=(i)=>{if(i.value.endsWith(t.suffix))return;i.issues.push({origin:"string",code:"invalid_format",format:"ends_with",suffix:t.suffix,input:i.value,inst:e,continue:!t.abort})}});var Hh=K("$ZodCheckOverwrite",(e,t)=>{Bt.init(e,t),e._zod.check=(n)=>{n.value=t.tx(n.value)}});class ka{constructor(e=[]){if(this.content=[],this.indent=0,this)this.args=e}indented(e){this.indent+=1,e(this),this.indent-=1}write(e){if(typeof e==="function"){e(this,{execution:"sync"}),e(this,{execution:"async"});return}let n=e.split(`
`).filter((s)=>s),i=Math.min(...n.map((s)=>s.length-s.trimStart().length)),r=n.map((s)=>s.slice(i)).map((s)=>" ".repeat(this.indent*2)+s);for(let s of r)this.content.push(s)}compile(){let e=Function,t=this?.args,i=[...(this?.content??[""]).map((r)=>`  ${r}`)];return new e(...t,i.join(`
`))}}var Wh={major:4,minor:4,patch:3};var St=K("$ZodType",(e,t)=>{var n;e??(e={}),e._zod.def=t,e._zod.bag=e._zod.bag||{},e._zod.version=Wh;let i=[...e._zod.def.checks??[]];if(e._zod.traits.has("$ZodCheck"))i.unshift(e);for(let r of i)for(let s of r._zod.onattach)s(e);if(i.length===0)(n=e._zod).deferred??(n.deferred=[]),e._zod.deferred?.push(()=>{e._zod.run=e._zod.parse});else{let r=(o,a,c)=>{let l=Oi(o),u;for(let d of a){if(d._zod.def.when){if(Hu(o))continue;if(!d._zod.def.when(o))continue}else if(l)continue;let h=o.issues.length,f=d._zod.check(o);if(f instanceof Promise&&c?.async===!1)throw new Xn;if(u||f instanceof Promise)u=(u??Promise.resolve()).then(async()=>{if(await f,o.issues.length===h)return;if(!l)l=Oi(o,h)});else{if(o.issues.length===h)continue;if(!l)l=Oi(o,h)}}if(u)return u.then(()=>o);return o},s=(o,a,c)=>{if(Oi(o))return o.aborted=!0,o;let l=r(a,i,c);if(l instanceof Promise){if(c.async===!1)throw new Xn;return l.then((u)=>e._zod.parse(u,c))}return e._zod.parse(l,c)};e._zod.run=(o,a)=>{if(a.skipChecks)return e._zod.parse(o,a);if(a.direction==="backward"){let l=e._zod.parse({value:o.value,issues:[]},{...a,skipChecks:!0});if(l instanceof Promise)return l.then((u)=>s(u,o,a));return s(l,o,a)}let c=e._zod.parse(o,a);if(c instanceof Promise){if(a.async===!1)throw new Xn;return c.then((l)=>r(l,i,a))}return r(c,i,a)}}rt(e,"~standard",()=>({validate:(r)=>{try{let s=Zu(e,r);return s.success?{value:s.data}:{issues:s.error?.issues}}catch(s){return Xu(e,r).then((o)=>o.success?{value:o.data}:{issues:o.error?.issues})}},vendor:"zod",version:1}))}),ao=K("$ZodString",(e,t)=>{St.init(e,t),e._zod.pattern=[...e?._zod.bag?.patterns??[]].pop()??wh(e._zod.bag),e._zod.parse=(n,i)=>{if(t.coerce)try{n.value=String(n.value)}catch(r){}if(typeof n.value==="string")return n;return n.issues.push({expected:"string",code:"invalid_type",input:n.value,inst:e}),n}}),mt=K("$ZodStringFormat",(e,t)=>{ts.init(e,t),ao.init(e,t)}),Qh=K("$ZodGUID",(e,t)=>{t.pattern??(t.pattern=lh),mt.init(e,t)}),ed=K("$ZodUUID",(e,t)=>{if(t.version){let i={v1:1,v2:2,v3:3,v4:4,v5:5,v6:6,v7:7,v8:8}[t.version];if(i===void 0)throw Error(`Invalid UUID version: "${t.version}"`);t.pattern??(t.pattern=Ua(i))}else t.pattern??(t.pattern=Ua());mt.init(e,t)}),td=K("$ZodEmail",(e,t)=>{t.pattern??(t.pattern=uh),mt.init(e,t)}),nd=K("$ZodURL",(e,t)=>{mt.init(e,t),e._zod.check=(n)=>{try{let i=n.value.trim();if(!t.normalize&&t.protocol?.source===_h.source){if(!/^https?:\/\//i.test(i)){n.issues.push({code:"invalid_format",format:"url",note:"Invalid URL format",input:n.value,inst:e,continue:!t.abort});return}}let r=new URL(i);if(t.hostname){if(t.hostname.lastIndex=0,!t.hostname.test(r.hostname))n.issues.push({code:"invalid_format",format:"url",note:"Invalid hostname",pattern:t.hostname.source,input:n.value,inst:e,continue:!t.abort})}if(t.protocol){if(t.protocol.lastIndex=0,!t.protocol.test(r.protocol.endsWith(":")?r.protocol.slice(0,-1):r.protocol))n.issues.push({code:"invalid_format",format:"url",note:"Invalid protocol",pattern:t.protocol.source,input:n.value,inst:e,continue:!t.abort})}if(t.normalize)n.value=r.href;else n.value=i;return}catch(i){n.issues.push({code:"invalid_format",format:"url",input:n.value,inst:e,continue:!t.abort})}}}),id=K("$ZodEmoji",(e,t)=>{t.pattern??(t.pattern=hh()),mt.init(e,t)}),rd=K("$ZodNanoID",(e,t)=>{t.pattern??(t.pattern=ah),mt.init(e,t)}),sd=K("$ZodCUID",(e,t)=>{t.pattern??(t.pattern=nh),mt.init(e,t)}),od=K("$ZodCUID2",(e,t)=>{t.pattern??(t.pattern=ih),mt.init(e,t)}),ad=K("$ZodULID",(e,t)=>{t.pattern??(t.pattern=rh),mt.init(e,t)}),cd=K("$ZodXID",(e,t)=>{t.pattern??(t.pattern=sh),mt.init(e,t)}),ld=K("$ZodKSUID",(e,t)=>{t.pattern??(t.pattern=oh),mt.init(e,t)}),ud=K("$ZodISODateTime",(e,t)=>{t.pattern??(t.pattern=Mh(t)),mt.init(e,t)}),hd=K("$ZodISODate",(e,t)=>{t.pattern??(t.pattern=yh),mt.init(e,t)}),dd=K("$ZodISOTime",(e,t)=>{t.pattern??(t.pattern=bh(t)),mt.init(e,t)}),fd=K("$ZodISODuration",(e,t)=>{t.pattern??(t.pattern=ch),mt.init(e,t)}),pd=K("$ZodIPv4",(e,t)=>{t.pattern??(t.pattern=dh),mt.init(e,t),e._zod.bag.format="ipv4"}),md=K("$ZodIPv6",(e,t)=>{t.pattern??(t.pattern=fh),mt.init(e,t),e._zod.bag.format="ipv6",e._zod.check=(n)=>{try{new URL(`http://[${n.value}]`)}catch{n.issues.push({code:"invalid_format",format:"ipv6",input:n.value,inst:e,continue:!t.abort})}}});var gd=K("$ZodCIDRv4",(e,t)=>{t.pattern??(t.pattern=ph),mt.init(e,t)}),_d=K("$ZodCIDRv6",(e,t)=>{t.pattern??(t.pattern=mh),mt.init(e,t),e._zod.check=(n)=>{let i=n.value.split("/");try{if(i.length!==2)throw Error();let[r,s]=i;if(!s)throw Error();let o=Number(s);if(`${o}`!==s)throw Error();if(o<0||o>128)throw Error();new URL(`http://[${r}]`)}catch{n.issues.push({code:"invalid_format",format:"cidrv6",input:n.value,inst:e,continue:!t.abort})}}});function xd(e){if(e==="")return!0;if(/\s/.test(e))return!1;if(e.length%4!==0)return!1;try{return atob(e),!0}catch{return!1}}var vd=K("$ZodBase64",(e,t)=>{t.pattern??(t.pattern=gh),mt.init(e,t),e._zod.bag.contentEncoding="base64",e._zod.check=(n)=>{if(xd(n.value))return;n.issues.push({code:"invalid_format",format:"base64",input:n.value,inst:e,continue:!t.abort})}});function q_(e){if(!Oa.test(e))return!1;let t=e.replace(/[-_]/g,(i)=>i==="-"?"+":"/"),n=t.padEnd(Math.ceil(t.length/4)*4,"=");return xd(n)}var yd=K("$ZodBase64URL",(e,t)=>{t.pattern??(t.pattern=Oa),mt.init(e,t),e._zod.bag.contentEncoding="base64url",e._zod.check=(n)=>{if(q_(n.value))return;n.issues.push({code:"invalid_format",format:"base64url",input:n.value,inst:e,continue:!t.abort})}}),Sd=K("$ZodE164",(e,t)=>{t.pattern??(t.pattern=xh),mt.init(e,t)});function Y_(e,t=null){try{let n=e.split(".");if(n.length!==3)return!1;let[i]=n;if(!i)return!1;let r=JSON.parse(atob(i));if("typ"in r&&r?.typ!=="JWT")return!1;if(!r.alg)return!1;if(t&&(!("alg"in r)||r.alg!==t))return!1;return!0}catch{return!1}}var bd=K("$ZodJWT",(e,t)=>{mt.init(e,t),e._zod.check=(n)=>{if(Y_(n.value,t.alg))return;n.issues.push({code:"invalid_format",format:"jwt",input:n.value,inst:e,continue:!t.abort})}});var Ga=K("$ZodNumber",(e,t)=>{St.init(e,t),e._zod.pattern=e._zod.bag.pattern??Eh,e._zod.parse=(n,i)=>{if(t.coerce)try{n.value=Number(n.value)}catch(o){}let r=n.value;if(typeof r==="number"&&!Number.isNaN(r)&&Number.isFinite(r))return n;let s=typeof r==="number"?Number.isNaN(r)?"NaN":!Number.isFinite(r)?"Infinity":void 0:void 0;return n.issues.push({expected:"number",code:"invalid_type",input:r,inst:e,...s?{received:s}:{}}),n}}),Md=K("$ZodNumberFormat",(e,t)=>{Lh.init(e,t),Ga.init(e,t)}),wd=K("$ZodBoolean",(e,t)=>{St.init(e,t),e._zod.pattern=Ah,e._zod.parse=(n,i)=>{if(t.coerce)try{n.value=Boolean(n.value)}catch(s){}let r=n.value;if(typeof r==="boolean")return n;return n.issues.push({expected:"boolean",code:"invalid_type",input:r,inst:e}),n}});var Td=K("$ZodUnknown",(e,t)=>{St.init(e,t),e._zod.parse=(n)=>n}),Ed=K("$ZodNever",(e,t)=>{St.init(e,t),e._zod.parse=(n,i)=>(n.issues.push({expected:"never",code:"invalid_type",input:n.value,inst:e}),n)});function $h(e,t,n){if(e.issues.length)t.issues.push(...Qs(n,e.issues));t.value[n]=e.value}var Ad=K("$ZodArray",(e,t)=>{St.init(e,t),e._zod.parse=(n,i)=>{let r=n.value;if(!Array.isArray(r))return n.issues.push({expected:"array",code:"invalid_type",input:r,inst:e}),n;n.value=Array(r.length);let s=[];for(let o=0;o<r.length;o++){let a=r[o],c=t.element._zod.run({value:a,issues:[]},i);if(c instanceof Promise)s.push(c.then((l)=>$h(l,n,o)));else $h(c,n,o)}if(s.length)return Promise.all(s).then(()=>n);return n}});function oo(e,t,n,i,r,s){let o=n in i;if(e.issues.length){if(r&&s&&!o)return;t.issues.push(...Qs(n,e.issues))}if(!o&&!r){if(!e.issues.length)t.issues.push({code:"invalid_type",expected:"nonoptional",input:void 0,path:[n]});return}if(e.value===void 0){if(o)t.value[n]=void 0}else t.value[n]=e.value}function Rd(e){let t=Object.keys(e.shape);for(let i of t)if(!e.shape?.[i]?._zod?.traits?.has("$ZodType"))throw Error(`Invalid element at key "${i}": expected a Zod schema`);let n=Bu(e.shape);return{...e,keys:t,keySet:new Set(t),numKeys:t.length,optionalKeys:new Set(n)}}function Cd(e,t,n,i,r,s){let o=[],a=r.keySet,c=r.catchall._zod,l=c.def.type,u=c.optin==="optional",d=c.optout==="optional";for(let h in t){if(h==="__proto__")continue;if(a.has(h))continue;if(l==="never"){o.push(h);continue}let f=c.run({value:t[h],issues:[]},i);if(f instanceof Promise)e.push(f.then((g)=>oo(g,n,h,t,u,d)));else oo(f,n,h,t,u,d)}if(o.length)n.issues.push({code:"unrecognized_keys",keys:o,input:t,inst:s});if(!e.length)return n;return Promise.all(e).then(()=>n)}var J_=K("$ZodObject",(e,t)=>{if(St.init(e,t),!Object.getOwnPropertyDescriptor(t,"shape")?.get){let a=t.shape;Object.defineProperty(t,"shape",{get:()=>{let c={...a};return Object.defineProperty(t,"shape",{value:c}),c}})}let i=Js(()=>Rd(t));rt(e._zod,"propValues",()=>{let a=t.shape,c={};for(let l in a){let u=a[l]._zod;if(u.values){c[l]??(c[l]=new Set);for(let d of u.values)c[l].add(d)}}return c});let r=Kr,s=t.catchall,o;e._zod.parse=(a,c)=>{o??(o=i.value);let l=a.value;if(!r(l))return a.issues.push({expected:"object",code:"invalid_type",input:l,inst:e}),a;a.value={};let u=[],d=o.shape;for(let h of o.keys){let f=d[h],g=f._zod.optin==="optional",S=f._zod.optout==="optional",p=f._zod.run({value:l[h],issues:[]},c);if(p instanceof Promise)u.push(p.then((m)=>oo(m,a,h,l,g,S)));else oo(p,a,h,l,g,S)}if(!s)return u.length?Promise.all(u).then(()=>a):a;return Cd(u,l,a,c,i.value,e)}}),Id=K("$ZodObjectJIT",(e,t)=>{J_.init(e,t);let n=e._zod.parse,i=Js(()=>Rd(t)),r=(h)=>{let f=new ka(["shape","payload","ctx"]),g=i.value,S=(A)=>{let v=Pa(A);return`shape[${v}]._zod.run({ value: input[${v}], issues: [] }, ctx)`};f.write("const input = payload.value;");let p=Object.create(null),m=0;for(let A of g.keys)p[A]=`key_${m++}`;f.write("const newResult = {};");for(let A of g.keys){let v=p[A],w=Pa(A),E=h[A],R=E?._zod?.optin==="optional",x=E?._zod?.optout==="optional";if(f.write(`const ${v} = ${S(A)};`),R&&x)f.write(`
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
        
      `)}f.write("payload.value = newResult;"),f.write("return payload;");let T=f.compile();return(A,v)=>T(h,A,v)},s,o=Kr,a=!cr.jitless,l=a&&zu.value,u=t.catchall,d;e._zod.parse=(h,f)=>{d??(d=i.value);let g=h.value;if(!o(g))return h.issues.push({expected:"object",code:"invalid_type",input:g,inst:e}),h;if(a&&l&&f?.async===!1&&f.jitless!==!0){if(!s)s=r(t.shape);if(h=s(h,f),!u)return h;return Cd([],g,h,f,d,e)}return n(h,f)}});function Zh(e,t,n,i){for(let s of e)if(s.issues.length===0)return t.value=s.value,t;let r=e.filter((s)=>!Oi(s));if(r.length===1)return t.value=r[0].value,r[0];return t.issues.push({code:"invalid_union",input:t.value,inst:n,errors:e.map((s)=>s.issues.map((o)=>Yn(o,i,qn())))}),t}var Pd=K("$ZodUnion",(e,t)=>{St.init(e,t),rt(e._zod,"optin",()=>t.options.some((i)=>i._zod.optin==="optional")?"optional":void 0),rt(e._zod,"optout",()=>t.options.some((i)=>i._zod.optout==="optional")?"optional":void 0),rt(e._zod,"values",()=>{if(t.options.every((i)=>i._zod.values))return new Set(t.options.flatMap((i)=>Array.from(i._zod.values)));return}),rt(e._zod,"pattern",()=>{if(t.options.every((i)=>i._zod.pattern)){let i=t.options.map((r)=>r._zod.pattern);return new RegExp(`^(${i.map((r)=>js(r.source)).join("|")})$`)}return});let n=t.options.length===1?t.options[0]._zod.run:null;e._zod.parse=(i,r)=>{if(n)return n(i,r);let s=!1,o=[];for(let a of t.options){let c=a._zod.run({value:i.value,issues:[]},r);if(c instanceof Promise)o.push(c),s=!0;else{if(c.issues.length===0)return c;o.push(c)}}if(!s)return Zh(o,i,e,r);return Promise.all(o).then((a)=>Zh(a,i,e,r))}});var Ld=K("$ZodIntersection",(e,t)=>{St.init(e,t),e._zod.parse=(n,i)=>{let r=n.value,s=t.left._zod.run({value:r,issues:[]},i),o=t.right._zod.run({value:r,issues:[]},i);if(s instanceof Promise||o instanceof Promise)return Promise.all([s,o]).then(([c,l])=>Xh(n,c,l));return Xh(n,s,o)}});function Ba(e,t){if(e===t)return{valid:!0,data:e};if(e instanceof Date&&t instanceof Date&&+e===+t)return{valid:!0,data:e};if(lr(e)&&lr(t)){let n=Object.keys(t),i=Object.keys(e).filter((s)=>n.indexOf(s)!==-1),r={...e,...t};for(let s of i){let o=Ba(e[s],t[s]);if(!o.valid)return{valid:!1,mergeErrorPath:[s,...o.mergeErrorPath]};r[s]=o.data}return{valid:!0,data:r}}if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return{valid:!1,mergeErrorPath:[]};let n=[];for(let i=0;i<e.length;i++){let r=e[i],s=t[i],o=Ba(r,s);if(!o.valid)return{valid:!1,mergeErrorPath:[i,...o.mergeErrorPath]};n.push(o.data)}return{valid:!0,data:n}}return{valid:!1,mergeErrorPath:[]}}function Xh(e,t,n){let i=new Map,r;for(let a of t.issues)if(a.code==="unrecognized_keys"){r??(r=a);for(let c of a.keys){if(!i.has(c))i.set(c,{});i.get(c).l=!0}}else e.issues.push(a);for(let a of n.issues)if(a.code==="unrecognized_keys")for(let c of a.keys){if(!i.has(c))i.set(c,{});i.get(c).r=!0}else e.issues.push(a);let s=[...i].filter(([,a])=>a.l&&a.r).map(([a])=>a);if(s.length&&r)e.issues.push({...r,keys:s});if(Oi(e))return e;let o=Ba(t.value,n.value);if(!o.valid)throw Error(`Unmergable intersection. Error path: ${JSON.stringify(o.mergeErrorPath)}`);return e.value=o.data,e}var Nd=K("$ZodEnum",(e,t)=>{St.init(e,t);let n=Ys(t.entries),i=new Set(n);e._zod.values=i,e._zod.pattern=new RegExp(`^(${n.filter((r)=>ku.has(typeof r)).map((r)=>typeof r==="string"?ur(r):r.toString()).join("|")})$`),e._zod.parse=(r,s)=>{let o=r.value;if(i.has(o))return r;return r.issues.push({code:"invalid_value",values:n,input:o,inst:e}),r}});var Dd=K("$ZodTransform",(e,t)=>{St.init(e,t),e._zod.optin="optional",e._zod.parse=(n,i)=>{if(i.direction==="backward")throw new Jr(e.constructor.name);let r=t.transform(n.value,n);if(i.async)return(r instanceof Promise?r:Promise.resolve(r)).then((o)=>(n.value=o,n.fallback=!0,n));if(r instanceof Promise)throw new Xn;return n.value=r,n.fallback=!0,n}});function qh(e,t){if(t===void 0&&(e.issues.length||e.fallback))return{issues:[],value:void 0};return e}var Ha=K("$ZodOptional",(e,t)=>{St.init(e,t),e._zod.optin="optional",e._zod.optout="optional",rt(e._zod,"values",()=>t.innerType._zod.values?new Set([...t.innerType._zod.values,void 0]):void 0),rt(e._zod,"pattern",()=>{let n=t.innerType._zod.pattern;return n?new RegExp(`^(${js(n.source)})?$`):void 0}),e._zod.parse=(n,i)=>{if(t.innerType._zod.optin==="optional"){let r=n.value,s=t.innerType._zod.run(n,i);if(s instanceof Promise)return s.then((o)=>qh(o,r));return qh(s,r)}if(n.value===void 0)return n;return t.innerType._zod.run(n,i)}}),Ud=K("$ZodExactOptional",(e,t)=>{Ha.init(e,t),rt(e._zod,"values",()=>t.innerType._zod.values),rt(e._zod,"pattern",()=>t.innerType._zod.pattern),e._zod.parse=(n,i)=>t.innerType._zod.run(n,i)}),Od=K("$ZodNullable",(e,t)=>{St.init(e,t),rt(e._zod,"optin",()=>t.innerType._zod.optin),rt(e._zod,"optout",()=>t.innerType._zod.optout),rt(e._zod,"pattern",()=>{let n=t.innerType._zod.pattern;return n?new RegExp(`^(${js(n.source)}|null)$`):void 0}),rt(e._zod,"values",()=>t.innerType._zod.values?new Set([...t.innerType._zod.values,null]):void 0),e._zod.parse=(n,i)=>{if(n.value===null)return n;return t.innerType._zod.run(n,i)}}),Fd=K("$ZodDefault",(e,t)=>{St.init(e,t),e._zod.optin="optional",rt(e._zod,"values",()=>t.innerType._zod.values),e._zod.parse=(n,i)=>{if(i.direction==="backward")return t.innerType._zod.run(n,i);if(n.value===void 0)return n.value=t.defaultValue,n;let r=t.innerType._zod.run(n,i);if(r instanceof Promise)return r.then((s)=>Yh(s,t));return Yh(r,t)}});function Yh(e,t){if(e.value===void 0)e.value=t.defaultValue;return e}var zd=K("$ZodPrefault",(e,t)=>{St.init(e,t),e._zod.optin="optional",rt(e._zod,"values",()=>t.innerType._zod.values),e._zod.parse=(n,i)=>{if(i.direction==="backward")return t.innerType._zod.run(n,i);if(n.value===void 0)n.value=t.defaultValue;return t.innerType._zod.run(n,i)}}),kd=K("$ZodNonOptional",(e,t)=>{St.init(e,t),rt(e._zod,"values",()=>{let n=t.innerType._zod.values;return n?new Set([...n].filter((i)=>i!==void 0)):void 0}),e._zod.parse=(n,i)=>{let r=t.innerType._zod.run(n,i);if(r instanceof Promise)return r.then((s)=>Jh(s,e));return Jh(r,e)}});function Jh(e,t){if(!e.issues.length&&e.value===void 0)e.issues.push({code:"invalid_type",expected:"nonoptional",input:e.value,inst:t});return e}var Bd=K("$ZodCatch",(e,t)=>{St.init(e,t),e._zod.optin="optional",rt(e._zod,"optout",()=>t.innerType._zod.optout),rt(e._zod,"values",()=>t.innerType._zod.values),e._zod.parse=(n,i)=>{if(i.direction==="backward")return t.innerType._zod.run(n,i);let r=t.innerType._zod.run(n,i);if(r instanceof Promise)return r.then((s)=>{if(n.value=s.value,s.issues.length)n.value=t.catchValue({...n,error:{issues:s.issues.map((o)=>Yn(o,i,qn()))},input:n.value}),n.issues=[],n.fallback=!0;return n});if(n.value=r.value,r.issues.length)n.value=t.catchValue({...n,error:{issues:r.issues.map((s)=>Yn(s,i,qn()))},input:n.value}),n.issues=[],n.fallback=!0;return n}});var Gd=K("$ZodPipe",(e,t)=>{St.init(e,t),rt(e._zod,"values",()=>t.in._zod.values),rt(e._zod,"optin",()=>t.in._zod.optin),rt(e._zod,"optout",()=>t.out._zod.optout),rt(e._zod,"propValues",()=>t.in._zod.propValues),e._zod.parse=(n,i)=>{if(i.direction==="backward"){let s=t.out._zod.run(n,i);if(s instanceof Promise)return s.then((o)=>so(o,t.in,i));return so(s,t.in,i)}let r=t.in._zod.run(n,i);if(r instanceof Promise)return r.then((s)=>so(s,t.out,i));return so(r,t.out,i)}});function so(e,t,n){if(e.issues.length)return e.aborted=!0,e;return t._zod.run({value:e.value,issues:e.issues,fallback:e.fallback},n)}var Hd=K("$ZodReadonly",(e,t)=>{St.init(e,t),rt(e._zod,"propValues",()=>t.innerType._zod.propValues),rt(e._zod,"values",()=>t.innerType._zod.values),rt(e._zod,"optin",()=>t.innerType?._zod?.optin),rt(e._zod,"optout",()=>t.innerType?._zod?.optout),e._zod.parse=(n,i)=>{if(i.direction==="backward")return t.innerType._zod.run(n,i);let r=t.innerType._zod.run(n,i);if(r instanceof Promise)return r.then(Kh);return Kh(r)}});function Kh(e){return e.value=Object.freeze(e.value),e}var Vd=K("$ZodCustom",(e,t)=>{Bt.init(e,t),St.init(e,t),e._zod.parse=(n,i)=>n,e._zod.check=(n)=>{let i=n.value,r=t.fn(i);if(r instanceof Promise)return r.then((s)=>jh(s,n,i,e));jh(r,n,i,e);return}});function jh(e,t,n,i){if(!e){let r={code:"custom",input:n,inst:i,path:[...i._zod.def.path??[]],continue:!i._zod.def.abort};if(i._zod.def.params)r.params=i._zod.def.params;t.issues.push(Fi(r))}}var Wd,Nw=Symbol("ZodOutput"),Dw=Symbol("ZodInput");class $d{constructor(){this._map=new WeakMap,this._idmap=new Map}add(e,...t){let n=t[0];if(this._map.set(e,n),n&&typeof n==="object"&&"id"in n)this._idmap.set(n.id,e);return this}clear(){return this._map=new WeakMap,this._idmap=new Map,this}remove(e){let t=this._map.get(e);if(t&&typeof t==="object"&&"id"in t)this._idmap.delete(t.id);return this._map.delete(e),this}get(e){let t=e._zod.parent;if(t){let n={...this.get(t)??{}};delete n.id;let i={...n,...this._map.get(e)};return Object.keys(i).length?i:void 0}return this._map.get(e)}has(e){return this._map.has(e)}}function K_(){return new $d}(Wd=globalThis).__zod_globalRegistry??(Wd.__zod_globalRegistry=K_());var zi=globalThis.__zod_globalRegistry;function Zd(e,t){return new e({type:"string",...Ae(t)})}function Xd(e,t){return new e({type:"string",format:"email",check:"string_format",abort:!1,...Ae(t)})}function Va(e,t){return new e({type:"string",format:"guid",check:"string_format",abort:!1,...Ae(t)})}function qd(e,t){return new e({type:"string",format:"uuid",check:"string_format",abort:!1,...Ae(t)})}function Yd(e,t){return new e({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v4",...Ae(t)})}function Jd(e,t){return new e({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v6",...Ae(t)})}function Kd(e,t){return new e({type:"string",format:"uuid",check:"string_format",abort:!1,version:"v7",...Ae(t)})}function jd(e,t){return new e({type:"string",format:"url",check:"string_format",abort:!1,...Ae(t)})}function Qd(e,t){return new e({type:"string",format:"emoji",check:"string_format",abort:!1,...Ae(t)})}function ef(e,t){return new e({type:"string",format:"nanoid",check:"string_format",abort:!1,...Ae(t)})}function tf(e,t){return new e({type:"string",format:"cuid",check:"string_format",abort:!1,...Ae(t)})}function nf(e,t){return new e({type:"string",format:"cuid2",check:"string_format",abort:!1,...Ae(t)})}function rf(e,t){return new e({type:"string",format:"ulid",check:"string_format",abort:!1,...Ae(t)})}function sf(e,t){return new e({type:"string",format:"xid",check:"string_format",abort:!1,...Ae(t)})}function of(e,t){return new e({type:"string",format:"ksuid",check:"string_format",abort:!1,...Ae(t)})}function af(e,t){return new e({type:"string",format:"ipv4",check:"string_format",abort:!1,...Ae(t)})}function cf(e,t){return new e({type:"string",format:"ipv6",check:"string_format",abort:!1,...Ae(t)})}function lf(e,t){return new e({type:"string",format:"cidrv4",check:"string_format",abort:!1,...Ae(t)})}function uf(e,t){return new e({type:"string",format:"cidrv6",check:"string_format",abort:!1,...Ae(t)})}function hf(e,t){return new e({type:"string",format:"base64",check:"string_format",abort:!1,...Ae(t)})}function df(e,t){return new e({type:"string",format:"base64url",check:"string_format",abort:!1,...Ae(t)})}function ff(e,t){return new e({type:"string",format:"e164",check:"string_format",abort:!1,...Ae(t)})}function pf(e,t){return new e({type:"string",format:"jwt",check:"string_format",abort:!1,...Ae(t)})}function mf(e,t){return new e({type:"string",format:"datetime",check:"string_format",offset:!1,local:!1,precision:null,...Ae(t)})}function gf(e,t){return new e({type:"string",format:"date",check:"string_format",...Ae(t)})}function _f(e,t){return new e({type:"string",format:"time",check:"string_format",precision:null,...Ae(t)})}function xf(e,t){return new e({type:"string",format:"duration",check:"string_format",...Ae(t)})}function vf(e,t){return new e({type:"number",checks:[],...Ae(t)})}function yf(e,t){return new e({type:"number",check:"number_format",abort:!1,format:"safeint",...Ae(t)})}function Sf(e,t){return new e({type:"boolean",...Ae(t)})}function bf(e){return new e({type:"unknown"})}function Mf(e,t){return new e({type:"never",...Ae(t)})}function co(e,t){return new Fa({check:"less_than",...Ae(t),value:e,inclusive:!1})}function ns(e,t){return new Fa({check:"less_than",...Ae(t),value:e,inclusive:!0})}function lo(e,t){return new za({check:"greater_than",...Ae(t),value:e,inclusive:!1})}function is(e,t){return new za({check:"greater_than",...Ae(t),value:e,inclusive:!0})}function uo(e,t){return new Ph({check:"multiple_of",...Ae(t),value:e})}function ho(e,t){return new Nh({check:"max_length",...Ae(t),maximum:e})}function hr(e,t){return new Dh({check:"min_length",...Ae(t),minimum:e})}function fo(e,t){return new Uh({check:"length_equals",...Ae(t),length:e})}function Wa(e,t){return new Oh({check:"string_format",format:"regex",...Ae(t),pattern:e})}function $a(e){return new Fh({check:"string_format",format:"lowercase",...Ae(e)})}function Za(e){return new zh({check:"string_format",format:"uppercase",...Ae(e)})}function Xa(e,t){return new kh({check:"string_format",format:"includes",...Ae(t),includes:e})}function qa(e,t){return new Bh({check:"string_format",format:"starts_with",...Ae(t),prefix:e})}function Ya(e,t){return new Gh({check:"string_format",format:"ends_with",...Ae(t),suffix:e})}function fi(e){return new Hh({check:"overwrite",tx:e})}function Ja(e){return fi((t)=>t.normalize(e))}function Ka(){return fi((e)=>e.trim())}function ja(){return fi((e)=>e.toLowerCase())}function Qa(){return fi((e)=>e.toUpperCase())}function ec(){return fi((e)=>Fu(e))}function wf(e,t,n){return new e({type:"array",element:t,...Ae(n)})}function Tf(e,t,n){return new e({type:"custom",check:"custom",fn:t,...Ae(n)})}function Ef(e,t){let n=j_((i)=>(i.addIssue=(r)=>{if(typeof r==="string")i.issues.push(Fi(r,i.value,n._zod.def));else{let s=r;if(s.fatal)s.continue=!1;s.code??(s.code="custom"),s.input??(s.input=i.value),s.inst??(s.inst=n),s.continue??(s.continue=!n._zod.def.abort),i.issues.push(Fi(s))}},e(i.value,i)),t);return n}function j_(e,t){let n=new Bt({check:"custom",...Ae(t)});return n._zod.check=e,n}function tc(e){let t=e?.target??"draft-2020-12";if(t==="draft-4")t="draft-04";if(t==="draft-7")t="draft-07";return{processors:e.processors??{},metadataRegistry:e?.metadata??zi,target:t,unrepresentable:e?.unrepresentable??"throw",override:e?.override??(()=>{}),io:e?.io??"output",counter:0,seen:new Map,cycles:e?.cycles??"ref",reused:e?.reused??"inline",external:e?.external??void 0}}function Ut(e,t,n={path:[],schemaPath:[]}){var i;let r=e._zod.def,s=t.seen.get(e);if(s){if(s.count++,n.schemaPath.includes(e))s.cycle=n.path;return s.schema}let o={schema:{},count:1,cycle:void 0,path:n.path};t.seen.set(e,o);let a=e._zod.toJSONSchema?.();if(a)o.schema=a;else{let u={...n,schemaPath:[...n.schemaPath,e],path:n.path};if(e._zod.processJSONSchema)e._zod.processJSONSchema(t,o.schema,u);else{let h=o.schema,f=t.processors[r.type];if(!f)throw Error(`[toJSONSchema]: Non-representable type encountered: ${r.type}`);f(e,t,h,u)}let d=e._zod.parent;if(d){if(!o.ref)o.ref=d;Ut(d,t,u),t.seen.get(d).isParent=!0}}let c=t.metadataRegistry.get(e);if(c)Object.assign(o.schema,c);if(t.io==="input"&&Xt(e))delete o.schema.examples,delete o.schema.default;if(t.io==="input"&&"_prefault"in o.schema)(i=o.schema).default??(i.default=o.schema._prefault);return delete o.schema._prefault,t.seen.get(e).schema}function nc(e,t){let n=e.seen.get(t);if(!n)throw Error("Unprocessed schema. This is a bug in Zod.");let i=new Map;for(let o of e.seen.entries()){let a=e.metadataRegistry.get(o[0])?.id;if(a){let c=i.get(a);if(c&&c!==o[0])throw Error(`Duplicate schema id "${a}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);i.set(a,o[0])}}let r=(o)=>{let a=e.target==="draft-2020-12"?"$defs":"definitions";if(e.external){let d=e.external.registry.get(o[0])?.id,h=e.external.uri??((g)=>g);if(d)return{ref:h(d)};let f=o[1].defId??o[1].schema.id??`schema${e.counter++}`;return o[1].defId=f,{defId:f,ref:`${h("__shared")}#/${a}/${f}`}}if(o[1]===n)return{ref:"#"};let l=`${"#"}/${a}/`,u=o[1].schema.id??`__schema${e.counter++}`;return{defId:u,ref:l+u}},s=(o)=>{if(o[1].schema.$ref)return;let a=o[1],{ref:c,defId:l}=r(o);if(a.def={...a.schema},l)a.defId=l;let u=a.schema;for(let d in u)delete u[d];u.$ref=c};if(e.cycles==="throw")for(let o of e.seen.entries()){let a=o[1];if(a.cycle)throw Error(`Cycle detected: #/${a.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`)}for(let o of e.seen.entries()){let a=o[1];if(t===o[0]){s(o);continue}if(e.external){let l=e.external.registry.get(o[0])?.id;if(t!==o[0]&&l){s(o);continue}}if(e.metadataRegistry.get(o[0])?.id){s(o);continue}if(a.cycle){s(o);continue}if(a.count>1){if(e.reused==="ref"){s(o);continue}}}}function ic(e,t){let n=e.seen.get(t);if(!n)throw Error("Unprocessed schema. This is a bug in Zod.");let i=(a)=>{let c=e.seen.get(a);if(c.ref===null)return;let l=c.def??c.schema,u={...l},d=c.ref;if(c.ref=null,d){i(d);let f=e.seen.get(d),g=f.schema;if(g.$ref&&(e.target==="draft-07"||e.target==="draft-04"||e.target==="openapi-3.0"))l.allOf=l.allOf??[],l.allOf.push(g);else Object.assign(l,g);if(Object.assign(l,u),a._zod.parent===d)for(let p in l){if(p==="$ref"||p==="allOf")continue;if(!(p in u))delete l[p]}if(g.$ref&&f.def)for(let p in l){if(p==="$ref"||p==="allOf")continue;if(p in f.def&&JSON.stringify(l[p])===JSON.stringify(f.def[p]))delete l[p]}}let h=a._zod.parent;if(h&&h!==d){i(h);let f=e.seen.get(h);if(f?.schema.$ref){if(l.$ref=f.schema.$ref,f.def)for(let g in l){if(g==="$ref"||g==="allOf")continue;if(g in f.def&&JSON.stringify(l[g])===JSON.stringify(f.def[g]))delete l[g]}}}e.override({zodSchema:a,jsonSchema:l,path:c.path??[]})};for(let a of[...e.seen.entries()].reverse())i(a[0]);let r={};if(e.target==="draft-2020-12")r.$schema="https://json-schema.org/draft/2020-12/schema";else if(e.target==="draft-07")r.$schema="http://json-schema.org/draft-07/schema#";else if(e.target==="draft-04")r.$schema="http://json-schema.org/draft-04/schema#";else if(e.target==="openapi-3.0");if(e.external?.uri){let a=e.external.registry.get(t)?.id;if(!a)throw Error("Schema is missing an `id` property");r.$id=e.external.uri(a)}Object.assign(r,n.def??n.schema);let s=e.metadataRegistry.get(t)?.id;if(s!==void 0&&r.id===s)delete r.id;let o=e.external?.defs??{};for(let a of e.seen.entries()){let c=a[1];if(c.def&&c.defId){if(c.def.id===c.defId)delete c.def.id;o[c.defId]=c.def}}if(e.external);else if(Object.keys(o).length>0)if(e.target==="draft-2020-12")r.$defs=o;else r.definitions=o;try{let a=JSON.parse(JSON.stringify(r));return Object.defineProperty(a,"~standard",{value:{...t["~standard"],jsonSchema:{input:rs(t,"input",e.processors),output:rs(t,"output",e.processors)}},enumerable:!1,writable:!1}),a}catch(a){throw Error("Error converting schema to JSON.")}}function Xt(e,t){let n=t??{seen:new Set};if(n.seen.has(e))return!1;n.seen.add(e);let i=e._zod.def;if(i.type==="transform")return!0;if(i.type==="array")return Xt(i.element,n);if(i.type==="set")return Xt(i.valueType,n);if(i.type==="lazy")return Xt(i.getter(),n);if(i.type==="promise"||i.type==="optional"||i.type==="nonoptional"||i.type==="nullable"||i.type==="readonly"||i.type==="default"||i.type==="prefault")return Xt(i.innerType,n);if(i.type==="intersection")return Xt(i.left,n)||Xt(i.right,n);if(i.type==="record"||i.type==="map")return Xt(i.keyType,n)||Xt(i.valueType,n);if(i.type==="pipe"){if(e._zod.traits.has("$ZodCodec"))return!0;return Xt(i.in,n)||Xt(i.out,n)}if(i.type==="object"){for(let r in i.shape)if(Xt(i.shape[r],n))return!0;return!1}if(i.type==="union"){for(let r of i.options)if(Xt(r,n))return!0;return!1}if(i.type==="tuple"){for(let r of i.items)if(Xt(r,n))return!0;if(i.rest&&Xt(i.rest,n))return!0;return!1}return!1}var Af=(e,t={})=>(n)=>{let i=tc({...n,processors:t});return Ut(e,i),nc(i,e),ic(i,e)},rs=(e,t,n={})=>(i)=>{let{libraryOptions:r,target:s}=i??{},o=tc({...r??{},target:s,io:t,processors:n});return Ut(e,o),nc(o,e),ic(o,e)};var Q_={guid:"uuid",url:"uri",datetime:"date-time",json_string:"json-string",regex:""},Rf=(e,t,n,i)=>{let r=n;r.type="string";let{minimum:s,maximum:o,format:a,patterns:c,contentEncoding:l}=e._zod.bag;if(typeof s==="number")r.minLength=s;if(typeof o==="number")r.maxLength=o;if(a){if(r.format=Q_[a]??a,r.format==="")delete r.format;if(a==="time")delete r.format}if(l)r.contentEncoding=l;if(c&&c.size>0){let u=[...c];if(u.length===1)r.pattern=u[0].source;else if(u.length>1)r.allOf=[...u.map((d)=>({...t.target==="draft-07"||t.target==="draft-04"||t.target==="openapi-3.0"?{type:"string"}:{},pattern:d.source}))]}},Cf=(e,t,n,i)=>{let r=n,{minimum:s,maximum:o,format:a,multipleOf:c,exclusiveMaximum:l,exclusiveMinimum:u}=e._zod.bag;if(typeof a==="string"&&a.includes("int"))r.type="integer";else r.type="number";let d=typeof u==="number"&&u>=(s??Number.NEGATIVE_INFINITY),h=typeof l==="number"&&l<=(o??Number.POSITIVE_INFINITY),f=t.target==="draft-04"||t.target==="openapi-3.0";if(d)if(f)r.minimum=u,r.exclusiveMinimum=!0;else r.exclusiveMinimum=u;else if(typeof s==="number")r.minimum=s;if(h)if(f)r.maximum=l,r.exclusiveMaximum=!0;else r.exclusiveMaximum=l;else if(typeof o==="number")r.maximum=o;if(typeof c==="number")r.multipleOf=c},If=(e,t,n,i)=>{n.type="boolean"};var Pf=(e,t,n,i)=>{n.not={}};var Lf=(e,t,n,i)=>{};var Nf=(e,t,n,i)=>{let r=e._zod.def,s=Ys(r.entries);if(s.every((o)=>typeof o==="number"))n.type="number";if(s.every((o)=>typeof o==="string"))n.type="string";n.enum=s};var Df=(e,t,n,i)=>{if(t.unrepresentable==="throw")throw Error("Custom types cannot be represented in JSON Schema")};var Uf=(e,t,n,i)=>{if(t.unrepresentable==="throw")throw Error("Transforms cannot be represented in JSON Schema")};var Of=(e,t,n,i)=>{let r=n,s=e._zod.def,{minimum:o,maximum:a}=e._zod.bag;if(typeof o==="number")r.minItems=o;if(typeof a==="number")r.maxItems=a;r.type="array",r.items=Ut(s.element,t,{...i,path:[...i.path,"items"]})},Ff=(e,t,n,i)=>{let r=n,s=e._zod.def;r.type="object",r.properties={};let o=s.shape;for(let l in o)r.properties[l]=Ut(o[l],t,{...i,path:[...i.path,"properties",l]});let a=new Set(Object.keys(o)),c=new Set([...a].filter((l)=>{let u=s.shape[l]._zod;if(t.io==="input")return u.optin===void 0;else return u.optout===void 0}));if(c.size>0)r.required=Array.from(c);if(s.catchall?._zod.def.type==="never")r.additionalProperties=!1;else if(!s.catchall){if(t.io==="output")r.additionalProperties=!1}else if(s.catchall)r.additionalProperties=Ut(s.catchall,t,{...i,path:[...i.path,"additionalProperties"]})},zf=(e,t,n,i)=>{let r=e._zod.def,s=r.inclusive===!1,o=r.options.map((a,c)=>Ut(a,t,{...i,path:[...i.path,s?"oneOf":"anyOf",c]}));if(s)n.oneOf=o;else n.anyOf=o},kf=(e,t,n,i)=>{let r=e._zod.def,s=Ut(r.left,t,{...i,path:[...i.path,"allOf",0]}),o=Ut(r.right,t,{...i,path:[...i.path,"allOf",1]}),a=(l)=>("allOf"in l)&&Object.keys(l).length===1,c=[...a(s)?s.allOf:[s],...a(o)?o.allOf:[o]];n.allOf=c};var Bf=(e,t,n,i)=>{let r=e._zod.def,s=Ut(r.innerType,t,i),o=t.seen.get(e);if(t.target==="openapi-3.0")o.ref=r.innerType,n.nullable=!0;else n.anyOf=[s,{type:"null"}]},Gf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType},Hf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType,n.default=JSON.parse(JSON.stringify(r.defaultValue))},Vf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);if(s.ref=r.innerType,t.io==="input")n._prefault=JSON.parse(JSON.stringify(r.defaultValue))},Wf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType;let o;try{o=r.catchValue(void 0)}catch{throw Error("Dynamic catch values are not supported in JSON Schema")}n.default=o},$f=(e,t,n,i)=>{let r=e._zod.def,s=r.in._zod.traits.has("$ZodTransform"),o=t.io==="input"?s?r.out:r.in:r.out;Ut(o,t,i);let a=t.seen.get(e);a.ref=o},Zf=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType,n.readOnly=!0};var rc=(e,t,n,i)=>{let r=e._zod.def;Ut(r.innerType,t,i);let s=t.seen.get(e);s.ref=r.innerType};var o0=K("ZodISODateTime",(e,t)=>{ud.init(e,t),gt.init(e,t)});function Xf(e){return mf(o0,e)}var a0=K("ZodISODate",(e,t)=>{hd.init(e,t),gt.init(e,t)});function qf(e){return gf(a0,e)}var c0=K("ZodISOTime",(e,t)=>{dd.init(e,t),gt.init(e,t)});function Yf(e){return _f(c0,e)}var l0=K("ZodISODuration",(e,t)=>{fd.init(e,t),gt.init(e,t)});function Jf(e){return xf(l0,e)}var d0=(e,t)=>{to.init(e,t),e.name="ZodError",Object.defineProperties(e,{format:{value:(n)=>$u(e,n)},flatten:{value:(n)=>Wu(e,n)},addIssue:{value:(n)=>{e.issues.push(n),e.message=JSON.stringify(e.issues,jr,2)}},addIssues:{value:(n)=>{e.issues.push(...n),e.message=JSON.stringify(e.issues,jr,2)}},isEmpty:{get(){return e.issues.length===0}}})};var tn=K("ZodError",d0,{Parent:Error});var Kf=no(tn),jf=io(tn),Qf=Qr(tn),ep=es(tn),tp=qu(tn),np=Yu(tn),ip=Ju(tn),rp=Ku(tn),sp=ju(tn),op=Qu(tn),ap=eh(tn),cp=th(tn);var lp=new WeakMap;function ss(e,t,n){let i=Object.getPrototypeOf(e),r=lp.get(i);if(!r)r=new Set,lp.set(i,r);if(r.has(t))return;r.add(t);for(let s in n){let o=n[s];Object.defineProperty(i,s,{configurable:!0,enumerable:!1,get(){let a=o.bind(this);return Object.defineProperty(this,s,{configurable:!0,writable:!0,enumerable:!0,value:a}),a},set(a){Object.defineProperty(this,s,{configurable:!0,writable:!0,enumerable:!0,value:a})}})}}var Tt=K("ZodType",(e,t)=>(St.init(e,t),Object.assign(e["~standard"],{jsonSchema:{input:rs(e,"input"),output:rs(e,"output")}}),e.toJSONSchema=Af(e,{}),e.def=t,e.type=t.type,Object.defineProperty(e,"_def",{value:t}),e.parse=(n,i)=>Kf(e,n,i,{callee:e.parse}),e.safeParse=(n,i)=>Qf(e,n,i),e.parseAsync=async(n,i)=>jf(e,n,i,{callee:e.parseAsync}),e.safeParseAsync=async(n,i)=>ep(e,n,i),e.spa=e.safeParseAsync,e.encode=(n,i)=>tp(e,n,i),e.decode=(n,i)=>np(e,n,i),e.encodeAsync=async(n,i)=>ip(e,n,i),e.decodeAsync=async(n,i)=>rp(e,n,i),e.safeEncode=(n,i)=>sp(e,n,i),e.safeDecode=(n,i)=>op(e,n,i),e.safeEncodeAsync=async(n,i)=>ap(e,n,i),e.safeDecodeAsync=async(n,i)=>cp(e,n,i),ss(e,"ZodType",{check(...n){let i=this.def;return this.clone(hi(i,{checks:[...i.checks??[],...n.map((r)=>typeof r==="function"?{_zod:{check:r,def:{check:"custom"},onattach:[]}}:r)]}),{parent:!0})},with(...n){return this.check(...n)},clone(n,i){return Pn(this,n,i)},brand(){return this},register(n,i){return n.add(this,i),this},refine(n,i){return this.check(sx(n,i))},superRefine(n,i){return this.check(ox(n,i))},overwrite(n){return this.check(fi(n))},optional(){return fp(this)},exactOptional(){return Z0(this)},nullable(){return pp(this)},nullish(){return fp(pp(this))},nonoptional(n){return j0(this,n)},array(){return pi(this)},or(n){return B0([this,n])},and(n){return H0(this,n)},transform(n){return mp(this,W0(n))},default(n){return Y0(this,n)},prefault(n){return K0(this,n)},catch(n){return ex(this,n)},pipe(n){return mp(this,n)},readonly(){return ix(this)},describe(n){let i=this.clone();return zi.add(i,{description:n}),i},meta(...n){if(n.length===0)return zi.get(this);let i=this.clone();return zi.add(i,n[0]),i},isOptional(){return this.safeParse(void 0).success},isNullable(){return this.safeParse(null).success},apply(n){return n(this)}}),Object.defineProperty(e,"description",{get(){return zi.get(e)?.description},configurable:!0}),e)),gp=K("_ZodString",(e,t)=>{ao.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(i,r,s)=>Rf(e,i,r,s);let n=e._zod.bag;e.format=n.format??null,e.minLength=n.minimum??null,e.maxLength=n.maximum??null,ss(e,"_ZodString",{regex(...i){return this.check(Wa(...i))},includes(...i){return this.check(Xa(...i))},startsWith(...i){return this.check(qa(...i))},endsWith(...i){return this.check(Ya(...i))},min(...i){return this.check(hr(...i))},max(...i){return this.check(ho(...i))},length(...i){return this.check(fo(...i))},nonempty(...i){return this.check(hr(1,...i))},lowercase(i){return this.check($a(i))},uppercase(i){return this.check(Za(i))},trim(){return this.check(Ka())},normalize(...i){return this.check(Ja(...i))},toLowerCase(){return this.check(ja())},toUpperCase(){return this.check(Qa())},slugify(){return this.check(ec())}})}),p0=K("ZodString",(e,t)=>{ao.init(e,t),gp.init(e,t),e.email=(n)=>e.check(Xd(m0,n)),e.url=(n)=>e.check(jd(g0,n)),e.jwt=(n)=>e.check(pf(P0,n)),e.emoji=(n)=>e.check(Qd(_0,n)),e.guid=(n)=>e.check(Va(up,n)),e.uuid=(n)=>e.check(qd(mo,n)),e.uuidv4=(n)=>e.check(Yd(mo,n)),e.uuidv6=(n)=>e.check(Jd(mo,n)),e.uuidv7=(n)=>e.check(Kd(mo,n)),e.nanoid=(n)=>e.check(ef(x0,n)),e.guid=(n)=>e.check(Va(up,n)),e.cuid=(n)=>e.check(tf(v0,n)),e.cuid2=(n)=>e.check(nf(y0,n)),e.ulid=(n)=>e.check(rf(S0,n)),e.base64=(n)=>e.check(hf(R0,n)),e.base64url=(n)=>e.check(df(C0,n)),e.xid=(n)=>e.check(sf(b0,n)),e.ksuid=(n)=>e.check(of(M0,n)),e.ipv4=(n)=>e.check(af(w0,n)),e.ipv6=(n)=>e.check(cf(T0,n)),e.cidrv4=(n)=>e.check(lf(E0,n)),e.cidrv6=(n)=>e.check(uf(A0,n)),e.e164=(n)=>e.check(ff(I0,n)),e.datetime=(n)=>e.check(Xf(n)),e.date=(n)=>e.check(qf(n)),e.time=(n)=>e.check(Yf(n)),e.duration=(n)=>e.check(Jf(n))});function yt(e){return Zd(p0,e)}var gt=K("ZodStringFormat",(e,t)=>{mt.init(e,t),gp.init(e,t)}),m0=K("ZodEmail",(e,t)=>{td.init(e,t),gt.init(e,t)});var up=K("ZodGUID",(e,t)=>{Qh.init(e,t),gt.init(e,t)});var mo=K("ZodUUID",(e,t)=>{ed.init(e,t),gt.init(e,t)});var g0=K("ZodURL",(e,t)=>{nd.init(e,t),gt.init(e,t)});var _0=K("ZodEmoji",(e,t)=>{id.init(e,t),gt.init(e,t)});var x0=K("ZodNanoID",(e,t)=>{rd.init(e,t),gt.init(e,t)});var v0=K("ZodCUID",(e,t)=>{sd.init(e,t),gt.init(e,t)});var y0=K("ZodCUID2",(e,t)=>{od.init(e,t),gt.init(e,t)});var S0=K("ZodULID",(e,t)=>{ad.init(e,t),gt.init(e,t)});var b0=K("ZodXID",(e,t)=>{cd.init(e,t),gt.init(e,t)});var M0=K("ZodKSUID",(e,t)=>{ld.init(e,t),gt.init(e,t)});var w0=K("ZodIPv4",(e,t)=>{pd.init(e,t),gt.init(e,t)});var T0=K("ZodIPv6",(e,t)=>{md.init(e,t),gt.init(e,t)});var E0=K("ZodCIDRv4",(e,t)=>{gd.init(e,t),gt.init(e,t)});var A0=K("ZodCIDRv6",(e,t)=>{_d.init(e,t),gt.init(e,t)});var R0=K("ZodBase64",(e,t)=>{vd.init(e,t),gt.init(e,t)});var C0=K("ZodBase64URL",(e,t)=>{yd.init(e,t),gt.init(e,t)});var I0=K("ZodE164",(e,t)=>{Sd.init(e,t),gt.init(e,t)});var P0=K("ZodJWT",(e,t)=>{bd.init(e,t),gt.init(e,t)});var _p=K("ZodNumber",(e,t)=>{Ga.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(i,r,s)=>Cf(e,i,r,s),ss(e,"ZodNumber",{gt(i,r){return this.check(lo(i,r))},gte(i,r){return this.check(is(i,r))},min(i,r){return this.check(is(i,r))},lt(i,r){return this.check(co(i,r))},lte(i,r){return this.check(ns(i,r))},max(i,r){return this.check(ns(i,r))},int(i){return this.check(hp(i))},safe(i){return this.check(hp(i))},positive(i){return this.check(lo(0,i))},nonnegative(i){return this.check(is(0,i))},negative(i){return this.check(co(0,i))},nonpositive(i){return this.check(ns(0,i))},multipleOf(i,r){return this.check(uo(i,r))},step(i,r){return this.check(uo(i,r))},finite(){return this}});let n=e._zod.bag;e.minValue=Math.max(n.minimum??Number.NEGATIVE_INFINITY,n.exclusiveMinimum??Number.NEGATIVE_INFINITY)??null,e.maxValue=Math.min(n.maximum??Number.POSITIVE_INFINITY,n.exclusiveMaximum??Number.POSITIVE_INFINITY)??null,e.isInt=(n.format??"").includes("int")||Number.isSafeInteger(n.multipleOf??0.5),e.isFinite=!0,e.format=n.format??null});function Ve(e){return vf(_p,e)}var L0=K("ZodNumberFormat",(e,t)=>{Md.init(e,t),_p.init(e,t)});function hp(e){return yf(L0,e)}var N0=K("ZodBoolean",(e,t)=>{wd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>If(e,n,i,r)});function D0(e){return Sf(N0,e)}var U0=K("ZodUnknown",(e,t)=>{Td.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Lf(e,n,i,r)});function dp(){return bf(U0)}var O0=K("ZodNever",(e,t)=>{Ed.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Pf(e,n,i,r)});function xp(e){return Mf(O0,e)}var F0=K("ZodArray",(e,t)=>{Ad.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Of(e,n,i,r),e.element=t.element,ss(e,"ZodArray",{min(n,i){return this.check(hr(n,i))},nonempty(n){return this.check(hr(1,n))},max(n,i){return this.check(ho(n,i))},length(n,i){return this.check(fo(n,i))},unwrap(){return this.element}})});function pi(e,t){return wf(F0,e,t)}var z0=K("ZodObject",(e,t)=>{Id.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Ff(e,n,i,r),rt(e,"shape",()=>t.shape),ss(e,"ZodObject",{keyof(){return ki(Object.keys(this._zod.def.shape))},catchall(n){return this.clone({...this._zod.def,catchall:n})},passthrough(){return this.clone({...this._zod.def,catchall:dp()})},loose(){return this.clone({...this._zod.def,catchall:dp()})},strict(){return this.clone({...this._zod.def,catchall:xp()})},strip(){return this.clone({...this._zod.def,catchall:void 0})},extend(n){return G_(this,n)},safeExtend(n){return H_(this,n)},merge(n){return V_(this,n)},pick(n){return k_(this,n)},omit(n){return B_(this,n)},partial(...n){return W_(vp,this,n[0])},required(...n){return $_(yp,this,n[0])}})});function Ln(e,t){return new z0({type:"object",shape:e,catchall:xp(),...Ae(t)})}var k0=K("ZodUnion",(e,t)=>{Pd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>zf(e,n,i,r),e.options=t.options});function B0(e,t){return new k0({type:"union",options:e,...Ae(t)})}var G0=K("ZodIntersection",(e,t)=>{Ld.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>kf(e,n,i,r)});function H0(e,t){return new G0({type:"intersection",left:e,right:t})}var sc=K("ZodEnum",(e,t)=>{Nd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(i,r,s)=>Nf(e,i,r,s),e.enum=t.entries,e.options=Object.values(t.entries);let n=new Set(Object.keys(t.entries));e.extract=(i,r)=>{let s={};for(let o of i)if(n.has(o))s[o]=t.entries[o];else throw Error(`Key ${o} not found in enum`);return new sc({...t,checks:[],...Ae(r),entries:s})},e.exclude=(i,r)=>{let s={...t.entries};for(let o of i)if(n.has(o))delete s[o];else throw Error(`Key ${o} not found in enum`);return new sc({...t,checks:[],...Ae(r),entries:s})}});function ki(e,t){let n=Array.isArray(e)?Object.fromEntries(e.map((i)=>[i,i])):e;return new sc({type:"enum",entries:n,...Ae(t)})}var V0=K("ZodTransform",(e,t)=>{Dd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Uf(e,n,i,r),e._zod.parse=(n,i)=>{if(i.direction==="backward")throw new Jr(e.constructor.name);n.addIssue=(s)=>{if(typeof s==="string")n.issues.push(Fi(s,n.value,t));else{let o=s;if(o.fatal)o.continue=!1;o.code??(o.code="custom"),o.input??(o.input=n.value),o.inst??(o.inst=e),n.issues.push(Fi(o))}};let r=t.transform(n.value,n);if(r instanceof Promise)return r.then((s)=>(n.value=s,n.fallback=!0,n));return n.value=r,n.fallback=!0,n}});function W0(e){return new V0({type:"transform",transform:e})}var vp=K("ZodOptional",(e,t)=>{Ha.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>rc(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function fp(e){return new vp({type:"optional",innerType:e})}var $0=K("ZodExactOptional",(e,t)=>{Ud.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>rc(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function Z0(e){return new $0({type:"optional",innerType:e})}var X0=K("ZodNullable",(e,t)=>{Od.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Bf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function pp(e){return new X0({type:"nullable",innerType:e})}var q0=K("ZodDefault",(e,t)=>{Fd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Hf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType,e.removeDefault=e.unwrap});function Y0(e,t){return new q0({type:"default",innerType:e,get defaultValue(){return typeof t==="function"?t():Na(t)}})}var J0=K("ZodPrefault",(e,t)=>{zd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Vf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function K0(e,t){return new J0({type:"prefault",innerType:e,get defaultValue(){return typeof t==="function"?t():Na(t)}})}var yp=K("ZodNonOptional",(e,t)=>{kd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Gf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function j0(e,t){return new yp({type:"nonoptional",innerType:e,...Ae(t)})}var Q0=K("ZodCatch",(e,t)=>{Bd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Wf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType,e.removeCatch=e.unwrap});function ex(e,t){return new Q0({type:"catch",innerType:e,catchValue:typeof t==="function"?t:()=>t})}var tx=K("ZodPipe",(e,t)=>{Gd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>$f(e,n,i,r),e.in=t.in,e.out=t.out});function mp(e,t){return new tx({type:"pipe",in:e,out:t})}var nx=K("ZodReadonly",(e,t)=>{Hd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Zf(e,n,i,r),e.unwrap=()=>e._zod.def.innerType});function ix(e){return new nx({type:"readonly",innerType:e})}var rx=K("ZodCustom",(e,t)=>{Vd.init(e,t),Tt.init(e,t),e._zod.processJSONSchema=(n,i,r)=>Df(e,n,i,r)});function sx(e,t={}){return Tf(rx,e,t)}function ox(e,t){return Ef(e,t)}var ax={spark:"M12 1 L15 9 L23 12 L15 15 L12 23 L9 15 L1 12 L9 9 Z",play:"M5 2 L22 12 L5 22 Z",heart:"M12 22 C-10 8 1-5 12 5 C23-5 34 8 12 22 Z",check:"M1 12 L9 20 L23 3 L20 1 L9 15 L4 9 Z",arrow:"M1 9 L15 9 L10 4 L13 1 L24 12 L13 23 L10 20 L15 15 L1 15 Z"};function go(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;")}function Sp(e,t,n,i,r={}){let s=[];for(let o of e){if(t<o.start||t>=o.end)continue;let a=t-o.start+(o.phaseOffset||0),c=2*Math.PI*o.bpm/60*a,l=o.x*n,u=o.y*i,d=Math.max(0,Math.min(1,a/0.4,((o.phaseDuration||o.end-o.start)-a)/0.4)),h=1,f=0;if(o.animation==="slide")l-=n*(1-Math.min(1,a/0.6));if(o.animation==="pulse")h=0.85+0.15*Math.sin(c),d=0.6+0.4*Math.sin(c);if(o.animation==="bounce")u-=i*0.08*Math.abs(Math.sin(c));if(o.animation==="rotate")f=a*o.bpm*6;let g=o.font_size,S="";if(o.kind==="icon")S=`<path transform="translate(${-g/2},${-g/2}) scale(${g/24})" d="${ax[o.icon]}"/>`;else if(o.kind==="shape"){let p=o.shape==="circle"?g/2:0;if(o.animation==="morph")p=g/4*(1+Math.sin(c));S=`<rect x="${-g/2}" y="${-g/2}" width="${g}" height="${g}" rx="${p}"/>`}else if(o.kind==="image"){let p=r[o.imageMediaId||""];if(p&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p))S=`<image x="${-g/2}" y="${-g/2}" width="${g}" height="${g}" href="${go(p)}" preserveAspectRatio="xMidYMid meet"/>`}else{let p=o.text.split(`
`);S=`<text text-anchor="middle" dominant-baseline="middle" font-family="${o.font_family==="serif"?"Noto Serif CJK SC,SimSun,serif":"Arial,Microsoft YaHei,Noto Sans CJK SC,sans-serif"}" font-size="${g}">${p.map((T,A)=>`<tspan x="0" dy="${A===0?-(p.length-1)*g*0.6:g*1.2}">${go(T)}</tspan>`).join("")}</text>`}s.push(`<g data-studio-graphic-id="${go(o.id)}" transform="translate(${l},${u}) rotate(${f}) scale(${h})" fill="${go(o.color)}" opacity="${d}">${S}</g>`)}return`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${i}" viewBox="0 0 ${n} ${i}">${s.join("")}</svg>`}var bp=Ln({id:yt().min(1).max(128),kind:ki(["text","icon","shape","image"]).default("text"),text:yt().min(1).max(2000),icon:ki(["spark","play","heart","check","arrow"]).default("spark"),shape:ki(["square","circle"]).default("square"),imageMediaId:yt().min(1).max(128).optional(),start:Ve().min(0).max(3600),end:Ve().min(0.01).max(3600),phaseOffset:Ve().min(0).max(3600).optional(),phaseDuration:Ve().min(0.01).max(3600).optional(),x:Ve().min(0).max(1),y:Ve().min(0).max(1),font_size:Ve().int().min(12).max(300),font_family:ki(["sans","serif"]).optional(),color:yt().regex(/^#[0-9a-fA-F]{6}$/),animation:ki(["fade","slide","pulse","bounce","rotate","morph"]),bpm:Ve().int().min(30).max(240)}).refine((e)=>e.end>e.start,{message:"End must follow start"}).refine((e)=>e.animation!=="morph"||e.kind==="shape",{message:"Morph animation requires a shape"}).refine((e)=>e.kind!=="image"||Boolean(e.imageMediaId),{message:"Image graphics require a stored image"});var Mp=Ln({advanced:Ln({exports:pi(Ln({modelMediaId:yt().max(128),title:yt().max(200),createdAt:yt().max(40)})).max(50).optional(),models:pi(Ln({id:yt().max(128),title:yt().max(200),modelMediaId:yt().max(128),x:Ve().min(-10).max(10),assetId:yt().max(128).optional(),assetVersionId:yt().max(128).optional(),y:Ve().min(-10).max(10),z:Ve().min(-10).max(10),scale:Ve().min(0.01).max(10).default(1),yaw:Ve().min(-180).max(180).optional(),pitch:Ve().min(-180).max(180).optional(),roll:Ve().min(-180).max(180).optional(),animation:yt().max(200).default("")})).max(12).default([]),tracks:pi(Ln({targetId:yt().max(128),keys:pi(Ln({time:Ve().min(0).max(30),x:Ve().min(-100).max(100),y:Ve().min(-100).max(100),z:Ve().min(-100).max(100),yaw:Ve().min(-180).max(180)})).max(100)})).max(45).default([]),followId:yt().max(128).optional(),lookAtId:yt().max(128).optional(),showPaths:D0().default(!0)}).optional(),duration:Ve().min(1).max(30).default(5),camera:Ln({yaw:Ve().min(-180).max(180).default(20),endYaw:Ve().min(-180).max(180).default(20),pitch:Ve().min(5).max(80).default(20),distance:Ve().min(3).max(30).default(10),fov:Ve().min(20).max(100).default(50)}).default({yaw:20,endYaw:20,pitch:20,distance:10,fov:50}),actors:pi(Ln({id:yt().min(1).max(128),assetId:yt().max(128).optional(),title:yt().max(200),x:Ve().min(-10).max(10),z:Ve().min(-10).max(10),endX:Ve().min(-10).max(10),endZ:Ve().min(-10).max(10),yaw:Ve().min(-180).max(180).default(0),pose:ki(["stand","walk","wave","point","sit"]).default("stand"),color:yt().regex(/^#[0-9a-fA-F]{6}$/).default("#8ab4f8")})).max(12).default([]),props:pi(Ln({id:yt().min(1).max(128),title:yt().max(200),x:Ve().min(-10).max(10),z:Ve().min(-10).max(10),width:Ve().min(0.1).max(5),height:Ve().min(0.1).max(5),depth:Ve().min(0.1).max(5),color:yt().regex(/^#[0-9a-fA-F]{6}$/).default("#e6ad72")})).max(20).default([])}).superRefine((e,t)=>{let n=new Set(["__camera__"]);for(let s of[...e.actors,...e.props,...e.advanced?.models||[]]){if(!s.id||n.has(s.id))t.addIssue({code:"custom",message:"Stage objects require unique IDs; the camera ID is reserved"});n.add(s.id)}let i=e.advanced;if(!i)return;for(let s of[i.followId,i.lookAtId])if(s&&(!n.has(s)||s==="__camera__"))t.addIssue({code:"custom",message:"Camera targets must exist in the stage"});let r=new Set;for(let s of i.tracks){if(!n.has(s.targetId)||r.has(s.targetId))t.addIssue({code:"custom",message:"Tracks need unique existing targets"});r.add(s.targetId);let o=new Set;for(let a of s.keys){if(o.has(a.time)||a.time>e.duration)t.addIssue({code:"custom",message:"Keyframe times must be unique and within the scene"});o.add(a.time)}}});var hm="186";var dm=0,Dc=1,fm=2;var ys=1,pm=2,Nr=3,Mi=0,jt=1,mn=2,Un=0,Ss=1,Uc=2,Oc=3,Fc=4,mm=5;var Dr=100,gm=101,_m=102,xm=103,vm=104,ym=200,Sm=201,bm=202,Mm=203,wm=204,Tm=205,Em=206,Am=207,Rm=208,Cm=209,Im=210,Pm=211,Lm=212,Nm=213,Dm=214,Um=0,Om=1,Fm=2,zc=3,zm=4,km=5,Bm=6,Gm=7,Hm=0,Vm=1,Wm=2,wn=0,kc=1,Bc=2,Gc=3,Hc=4,Vc=5,Wc=6,$c=7;var Ur=301,Zi=302,qo=303,Yo=304,bs=306,Or=1000,Fr=1001,Jo=1002,Tn=1003,Ko=1004;var Xi=1005;var zt=1006,zr=1007;var On=1008;var En=1009,$m=1010,Zm=1011,Ms=1012,Zc=1013,wi=1014,si=1015,Fn=1016,Xc=1017,qc=1018,kr=1020,Xm=35902,qm=35899,Ym=1021,Jm=1022,zn=1023,qi=1026,Yi=1027,Km=1028,Yc=1029,Ji=1030,Jc=1031;var Kc=1033,jo=33776,Qo=33777,ea=33778,ta=33779,jc=35840,Qc=35841,el=35842,tl=35843,nl=36196,il=37492,rl=37496,sl=37488,ol=37489,na=37490,al=37491,cl=37808,ll=37809,ul=37810,hl=37811,dl=37812,fl=37813,pl=37814,ml=37815,gl=37816,_l=37817,xl=37818,vl=37819,yl=37820,Sl=37821,bl=36492,Ml=36494,wl=36495,Tl=36283,El=36284,ia=36285,Al=36286;var Rl=2300,ra=2301;var Cl=0,ws=1,Br=2,Il=3200;var Pl=0,jm=1,Ki="",Ti="srgb",on="srgb-linear",Ll="linear",ut="srgb";var Qm=512,eg=513,tg=514,sa=515,ng=516,ig=517,oa=518,rg=519;var Nl="300 es",Dl=2000;function cx(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function lx(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function Pr(e){return document.createElementNS("http://www.w3.org/1999/xhtml",e)}function sg(){let e=Pr("canvas");return e.style.display="block",e}var wp={},Lr=null;function vs(...e){let t="THREE."+e.shift();if(Lr)Lr("log",t,...e);else console.log(t,...e)}function og(e){let t=e[0];if(typeof t==="string"&&t.startsWith("TSL:")){let n=e[1];if(n&&n.isStackTrace)e[0]+=" "+n.getLocation();else e[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return e}function Te(...e){e=og(e);let t="THREE."+e.shift();if(Lr)Lr("warn",t,...e);else{let n=e[0];if(n&&n.isStackTrace)console.warn(n.getError(t));else console.warn(t,...e)}}function Ne(...e){e=og(e);let t="THREE."+e.shift();if(Lr)Lr("error",t,...e);else{let n=e[0];if(n&&n.isStackTrace)console.error(n.getError(t));else console.error(t,...e)}}function Wi(...e){let t=e.join(" ");if(t in wp)return;wp[t]=!0,Te(...e)}function ag(e,t,n){return new Promise(function(i,r){function s(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:r();break;case e.TIMEOUT_EXPIRED:setTimeout(s,n);break;default:i()}}setTimeout(s,n)})}var cg={[0]:1,[2]:6,[4]:7,[3]:5,[1]:0,[6]:2,[7]:4,[5]:3};class kn{addEventListener(e,t){if(this._listeners===void 0)this._listeners={};let n=this._listeners;if(n[e]===void 0)n[e]=[];if(n[e].indexOf(t)===-1)n[e].push(t)}hasEventListener(e,t){let n=this._listeners;if(n===void 0)return!1;return n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let i=n[e];if(i!==void 0){let r=i.indexOf(t);if(r!==-1)i.splice(r,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let i=n.slice(0);for(let r=0,s=i.length;r<s;r++)i[r].call(this,e);e.target=null}}}var Vt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Tp=1234567,_s=Math.PI/180,$i=180/Math.PI;function Mn(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(Vt[e&255]+Vt[e>>8&255]+Vt[e>>16&255]+Vt[e>>24&255]+"-"+Vt[t&255]+Vt[t>>8&255]+"-"+Vt[t>>16&15|64]+Vt[t>>24&255]+"-"+Vt[n&63|128]+Vt[n>>8&255]+"-"+Vt[n>>16&255]+Vt[n>>24&255]+Vt[i&255]+Vt[i>>8&255]+Vt[i>>16&255]+Vt[i>>24&255]).toLowerCase()}function Ze(e,t,n){return Math.max(t,Math.min(n,e))}function Ul(e,t){return(e%t+t)%t}function ux(e,t,n,i,r){return i+(e-t)*(r-i)/(n-t)}function hx(e,t,n){if(e!==t)return(n-e)/(t-e);else return 0}function xs(e,t,n){return(1-n)*e+n*t}function dx(e,t,n,i){return xs(e,t,1-Math.exp(-n*i))}function fx(e,t=1){return t-Math.abs(Ul(e,t*2)-t)}function px(e,t,n){if(e<=t)return 0;if(e>=n)return 1;return e=(e-t)/(n-t),e*e*(3-2*e)}function mx(e,t,n){if(e<=t)return 0;if(e>=n)return 1;return e=(e-t)/(n-t),e*e*e*(e*(e*6-15)+10)}function gx(e,t){return e+Math.floor(Math.random()*(t-e+1))}function _x(e,t){return e+Math.random()*(t-e)}function xx(e){return e*(0.5-Math.random())}function vx(e){if(e!==void 0)Tp=e;let t=Tp+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function yx(e){return e*_s}function Sx(e){return e*$i}function bx(e){return e>0&&Number.isInteger(e)&&2**Math.round(Math.log2(e))===e}function Mx(e){return Math.pow(2,Math.ceil(Math.log(e)/Math.LN2))}function wx(e){return Math.pow(2,Math.floor(Math.log(e)/Math.LN2))}function Tx(e,t,n,i,r){let{cos:s,sin:o}=Math,a=s(n/2),c=o(n/2),l=s((t+i)/2),u=o((t+i)/2),d=s((t-i)/2),h=o((t-i)/2),f=s((i-t)/2),g=o((i-t)/2);switch(r){case"XYX":e.set(a*u,c*d,c*h,a*l);break;case"YZY":e.set(c*h,a*u,c*d,a*l);break;case"ZXZ":e.set(c*d,c*h,a*u,a*l);break;case"XZX":e.set(a*u,c*g,c*f,a*l);break;case"YXY":e.set(c*f,a*u,c*g,a*l);break;case"ZYZ":e.set(c*g,c*f,a*u,a*l);break;default:Te("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+r)}}function bn(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:case Uint8ClampedArray:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error("THREE.MathUtils: Invalid component type.")}}function st(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error("THREE.MathUtils: Invalid component type.")}}var gn={DEG2RAD:_s,RAD2DEG:$i,generateUUID:Mn,clamp:Ze,euclideanModulo:Ul,mapLinear:ux,inverseLerp:hx,lerp:xs,damp:dx,pingpong:fx,smoothstep:px,smootherstep:mx,randInt:gx,randFloat:_x,randFloatSpread:xx,seededRandom:vx,degToRad:yx,radToDeg:Sx,isPowerOfTwo:bx,ceilPowerOfTwo:Mx,floorPowerOfTwo:wx,setQuaternionFromProperEuler:Tx,normalize:st,denormalize:bn};class Ue{static{Ue.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Ze(this.x,e.x,t.x),this.y=Ze(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Ze(this.x,e,t),this.y=Ze(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Ze(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(Ze(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),i=Math.sin(t),r=this.x-e.x,s=this.y-e.y;return this.x=r*n-s*i+e.x,this.y=r*i+s*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Gt{constructor(e=0,t=0,n=0,i=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=i}static slerpFlat(e,t,n,i,r,s,o){let a=n[i+0],c=n[i+1],l=n[i+2],u=n[i+3],d=r[s+0],h=r[s+1],f=r[s+2],g=r[s+3];if(u!==g||a!==d||c!==h||l!==f){let S=a*d+c*h+l*f+u*g;if(S<0)d=-d,h=-h,f=-f,g=-g,S=-S;let p=1-o;if(S<0.9995){let m=Math.acos(S),T=Math.sin(m);p=Math.sin(p*m)/T,o=Math.sin(o*m)/T,a=a*p+d*o,c=c*p+h*o,l=l*p+f*o,u=u*p+g*o}else{a=a*p+d*o,c=c*p+h*o,l=l*p+f*o,u=u*p+g*o;let m=1/Math.sqrt(a*a+c*c+l*l+u*u);a*=m,c*=m,l*=m,u*=m}}e[t]=a,e[t+1]=c,e[t+2]=l,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,i,r,s){let o=n[i],a=n[i+1],c=n[i+2],l=n[i+3],u=r[s],d=r[s+1],h=r[s+2],f=r[s+3];return e[t]=o*f+l*u+a*h-c*d,e[t+1]=a*f+l*d+c*u-o*h,e[t+2]=c*f+l*h+o*d-a*u,e[t+3]=l*f-o*u-a*d-c*h,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let{_x:n,_y:i,_z:r,_order:s}=e,{cos:o,sin:a}=Math,c=o(n/2),l=o(i/2),u=o(r/2),d=a(n/2),h=a(i/2),f=a(r/2);switch(s){case"XYZ":this._x=d*l*u+c*h*f,this._y=c*h*u-d*l*f,this._z=c*l*f+d*h*u,this._w=c*l*u-d*h*f;break;case"YXZ":this._x=d*l*u+c*h*f,this._y=c*h*u-d*l*f,this._z=c*l*f-d*h*u,this._w=c*l*u+d*h*f;break;case"ZXY":this._x=d*l*u-c*h*f,this._y=c*h*u+d*l*f,this._z=c*l*f+d*h*u,this._w=c*l*u-d*h*f;break;case"ZYX":this._x=d*l*u-c*h*f,this._y=c*h*u+d*l*f,this._z=c*l*f-d*h*u,this._w=c*l*u+d*h*f;break;case"YZX":this._x=d*l*u+c*h*f,this._y=c*h*u+d*l*f,this._z=c*l*f-d*h*u,this._w=c*l*u-d*h*f;break;case"XZY":this._x=d*l*u-c*h*f,this._y=c*h*u-d*l*f,this._z=c*l*f+d*h*u,this._w=c*l*u+d*h*f;break;default:Te("Quaternion: .setFromEuler() encountered an unknown order: "+s)}if(t===!0)this._onChangeCallback();return this}setFromAxisAngle(e,t){let n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],i=t[4],r=t[8],s=t[1],o=t[5],a=t[9],c=t[2],l=t[6],u=t[10],d=n+o+u;if(d>0){let h=0.5/Math.sqrt(d+1);this._w=0.25/h,this._x=(l-a)*h,this._y=(r-c)*h,this._z=(s-i)*h}else if(n>o&&n>u){let h=2*Math.sqrt(1+n-o-u);this._w=(l-a)/h,this._x=0.25*h,this._y=(i+s)/h,this._z=(r+c)/h}else if(o>u){let h=2*Math.sqrt(1+o-n-u);this._w=(r-c)/h,this._x=(i+s)/h,this._y=0.25*h,this._z=(a+l)/h}else{let h=2*Math.sqrt(1+u-n-o);this._w=(s-i)/h,this._x=(r+c)/h,this._y=(a+l)/h,this._z=0.25*h}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;if(n<0.00000001)if(n=0,Math.abs(e.x)>Math.abs(e.z))this._x=-e.y,this._y=e.x,this._z=0,this._w=n;else this._x=0,this._y=-e.z,this._z=e.y,this._w=n;else this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n;return this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Ze(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();if(e===0)this._x=0,this._y=0,this._z=0,this._w=1;else e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e;return this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let{_x:n,_y:i,_z:r,_w:s}=e,{_x:o,_y:a,_z:c,_w:l}=t;return this._x=n*l+s*o+i*c-r*a,this._y=i*l+s*a+r*o-n*c,this._z=r*l+s*c+n*a-i*o,this._w=s*l-n*o-i*a-r*c,this._onChangeCallback(),this}slerp(e,t){let{_x:n,_y:i,_z:r,_w:s}=e,o=this.dot(e);if(o<0)n=-n,i=-i,r=-r,s=-s,o=-o;let a=1-t;if(o<0.9995){let c=Math.acos(o),l=Math.sin(c);a=Math.sin(a*c)/l,t=Math.sin(t*c)/l,this._x=this._x*a+n*t,this._y=this._y*a+i*t,this._z=this._z*a+r*t,this._w=this._w*a+s*t,this._onChangeCallback()}else this._x=this._x*a+n*t,this._y=this._y*a+i*t,this._z=this._z*a+r*t,this._w=this._w*a+s*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(e),i*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class U{static{U.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){if(n===void 0)n=this.z;return this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Ep.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Ep.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*i,this.y=r[1]*t+r[4]*n+r[7]*i,this.z=r[2]*t+r[5]*n+r[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=e.elements,s=1/(r[3]*t+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*i+r[12])*s,this.y=(r[1]*t+r[5]*n+r[9]*i+r[13])*s,this.z=(r[2]*t+r[6]*n+r[10]*i+r[14])*s,this}applyQuaternion(e){let t=this.x,n=this.y,i=this.z,{x:r,y:s,z:o,w:a}=e,c=2*(s*i-o*n),l=2*(o*t-r*i),u=2*(r*n-s*t);return this.x=t+a*c+s*u-o*l,this.y=n+a*l+o*c-r*u,this.z=i+a*u+r*l-s*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*i,this.y=r[1]*t+r[5]*n+r[9]*i,this.z=r[2]*t+r[6]*n+r[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Ze(this.x,e.x,t.x),this.y=Ze(this.y,e.y,t.y),this.z=Ze(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Ze(this.x,e,t),this.y=Ze(this.y,e,t),this.z=Ze(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Ze(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let{x:n,y:i,z:r}=e,{x:s,y:o,z:a}=t;return this.x=i*a-r*o,this.y=r*s-n*a,this.z=n*o-i*s,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return ac.copy(this).projectOnVector(e),this.sub(ac)}reflect(e){return this.sub(ac.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(Ze(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}var ac=new U,Ep=new Gt;class Fe{static{Fe.prototype.isMatrix3=!0}constructor(e,t,n,i,r,s,o,a,c){if(this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0)this.set(e,t,n,i,r,s,o,a,c)}set(e,t,n,i,r,s,o,a,c){let l=this.elements;return l[0]=e,l[1]=i,l[2]=o,l[3]=t,l[4]=r,l[5]=a,l[6]=n,l[7]=s,l[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,s=n[0],o=n[3],a=n[6],c=n[1],l=n[4],u=n[7],d=n[2],h=n[5],f=n[8],g=i[0],S=i[3],p=i[6],m=i[1],T=i[4],A=i[7],v=i[2],w=i[5],E=i[8];return r[0]=s*g+o*m+a*v,r[3]=s*S+o*T+a*w,r[6]=s*p+o*A+a*E,r[1]=c*g+l*m+u*v,r[4]=c*S+l*T+u*w,r[7]=c*p+l*A+u*E,r[2]=d*g+h*m+f*v,r[5]=d*S+h*T+f*w,r[8]=d*p+h*A+f*E,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],s=e[4],o=e[5],a=e[6],c=e[7],l=e[8];return t*s*l-t*o*c-n*r*l+n*o*a+i*r*c-i*s*a}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],s=e[4],o=e[5],a=e[6],c=e[7],l=e[8],u=l*s-o*c,d=o*a-l*r,h=c*r-s*a,f=t*u+n*d+i*h;if(f===0)return this.set(0,0,0,0,0,0,0,0,0);let g=1/f;return e[0]=u*g,e[1]=(i*c-l*n)*g,e[2]=(o*n-i*s)*g,e[3]=d*g,e[4]=(l*t-i*a)*g,e[5]=(i*r-o*t)*g,e[6]=h*g,e[7]=(n*a-c*t)*g,e[8]=(s*t-n*r)*g,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,r,s,o){let a=Math.cos(r),c=Math.sin(r);return this.set(n*a,n*c,-n*(a*s+c*o)+s+e,-i*c,i*a,-i*(-c*s+a*o)+o+t,0,0,1),this}scale(e,t){return Wi("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(cc.makeScale(e,t)),this}rotate(e){return Wi("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(cc.makeRotation(-e)),this}translate(e,t){return Wi("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(cc.makeTranslation(e,t)),this}makeTranslation(e,t){if(e.isVector2)this.set(1,0,e.x,0,1,e.y,0,0,1);else this.set(1,0,e,0,1,t,0,0,1);return this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}}var cc=new Fe,Ap=new Fe().set(0.4123908,0.3575843,0.1804808,0.212639,0.7151687,0.0721923,0.0193308,0.1191948,0.9505322),Rp=new Fe().set(3.2409699,-1.5373832,-0.4986108,-0.9692436,1.8759675,0.0415551,0.0556301,-0.203977,1.0569715);function Ex(){let e={enabled:!0,workingColorSpace:"srgb-linear",spaces:{},convert:function(r,s,o){if(this.enabled===!1||s===o||!s||!o)return r;if(this.spaces[s].transfer==="srgb")r.r=ni(r.r),r.g=ni(r.g),r.b=ni(r.b);if(this.spaces[s].primaries!==this.spaces[o].primaries)r.applyMatrix3(this.spaces[s].toXYZ),r.applyMatrix3(this.spaces[o].fromXYZ);if(this.spaces[o].transfer==="srgb")r.r=Ir(r.r),r.g=Ir(r.g),r.b=Ir(r.b);return r},workingToColorSpace:function(r,s){return this.convert(r,this.workingColorSpace,s)},colorSpaceToWorking:function(r,s){return this.convert(r,s,this.workingColorSpace)},getPrimaries:function(r){return this.spaces[r].primaries},getTransfer:function(r){if(r==="")return"linear";return this.spaces[r].transfer},getToneMappingMode:function(r){return this.spaces[r].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(r,s=this.workingColorSpace){return r.fromArray(this.spaces[s].luminanceCoefficients)},define:function(r){Object.assign(this.spaces,r)},_getMatrix:function(r,s,o){return r.copy(this.spaces[s].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(r){return this.spaces[r].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(r=this.workingColorSpace){return this.spaces[r].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(r,s){return Wi("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),e.workingToColorSpace(r,s)},toWorkingColorSpace:function(r,s){return Wi("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),e.colorSpaceToWorking(r,s)}},t=[0.64,0.33,0.3,0.6,0.15,0.06],n=[0.2126,0.7152,0.0722],i=[0.3127,0.329];return e.define({["srgb-linear"]:{primaries:t,whitePoint:i,transfer:"linear",toXYZ:Ap,fromXYZ:Rp,luminanceCoefficients:n,workingColorSpaceConfig:{unpackColorSpace:"srgb"},outputColorSpaceConfig:{drawingBufferColorSpace:"srgb"}},["srgb"]:{primaries:t,whitePoint:i,transfer:"srgb",toXYZ:Ap,fromXYZ:Rp,luminanceCoefficients:n,outputColorSpaceConfig:{drawingBufferColorSpace:"srgb"}}}),e}var He=Ex();function ni(e){return e<0.04045?e*0.0773993808:Math.pow(e*0.9478672986+0.0521327014,2.4)}function Ir(e){return e<0.0031308?e*12.92:1.055*Math.pow(e,0.41666)-0.055}var dr;class Ol{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src))return e.src;if(typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{if(dr===void 0)dr=Pr("canvas");dr.width=e.width,dr.height=e.height;let i=dr.getContext("2d");if(e instanceof ImageData)i.putImageData(e,0,0);else i.drawImage(e,0,0,e.width,e.height);n=dr}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=Pr("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let i=n.getImageData(0,0,e.width,e.height),r=i.data;for(let s=0;s<r.length;s++)r[s]=ni(r[s]/255)*255;return n.putImageData(i,0,0),t}else if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)if(t instanceof Uint8Array||t instanceof Uint8ClampedArray)t[n]=Math.floor(ni(t[n]/255)*255);else t[n]=ni(t[n]);return{data:t,width:e.width,height:e.height}}else return Te("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}var Ax=0;class Ts{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:Ax++}),this.uuid=Mn(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;if(typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement)e.set(t.videoWidth,t.videoHeight,0);else if(typeof VideoFrame<"u"&&t instanceof VideoFrame)e.set(t.displayWidth,t.displayHeight,0);else if(t!==null)e.set(t.width,t.height,t.depth||0);else e.set(0,0,0);return e}set needsUpdate(e){if(e===!0)this.version++}toJSON(e){let t=e===void 0||typeof e==="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let s=0,o=i.length;s<o;s++)if(i[s].isDataTexture)r.push(lc(i[s].image));else r.push(lc(i[s]))}else r=lc(i);n.url=r}if(!t)e.images[this.uuid]=n;return n}}function lc(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap)return Ol.getDataURL(e);else if(e.data)return{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name};else return Te("Texture: Unable to serialize Texture."),{}}var Rx=0,uc=new U;class _t extends kn{constructor(e=_t.DEFAULT_IMAGE,t=_t.DEFAULT_MAPPING,n=1001,i=1001,r=1006,s=1008,o=1023,a=1009,c=_t.DEFAULT_ANISOTROPY,l=""){super();this.isTexture=!0,Object.defineProperty(this,"id",{value:Rx++}),this.uuid=Mn(),this.name="",this.source=new Ts(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=s,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=a,this.offset=new Ue(0,0),this.repeat=new Ue(1,1),this.center=new Ue(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Fe,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=l,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=e&&e.depth&&e.depth>1?!0:!1,this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(uc).x}get height(){return this.source.getSize(uc).y}get depth(){return this.source.getSize(uc).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){Te(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let i=this[t];if(i===void 0){Te(`Texture.setValues(): property '${t}' does not exist.`);continue}if(i&&n&&(i.isVector2&&n.isVector2))i.copy(n);else if(i&&n&&(i.isVector3&&n.isVector3))i.copy(n);else if(i&&n&&(i.isMatrix3&&n.isMatrix3))i.copy(n);else this[t]=n}}toJSON(e){let t=e===void 0||typeof e==="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};if(Object.keys(this.userData).length>0)n.userData=this.userData;if(!t)e.textures[this.uuid]=n;return n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==300)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case 1000:e.x=e.x-Math.floor(e.x);break;case 1001:e.x=e.x<0?0:1;break;case 1002:if(Math.abs(Math.floor(e.x)%2)===1)e.x=Math.ceil(e.x)-e.x;else e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case 1000:e.y=e.y-Math.floor(e.y);break;case 1001:e.y=e.y<0?0:1;break;case 1002:if(Math.abs(Math.floor(e.y)%2)===1)e.y=Math.ceil(e.y)-e.y;else e.y=e.y-Math.floor(e.y);break}if(this.flipY)e.y=1-e.y;return e}set needsUpdate(e){if(e===!0)this.version++,this.source.needsUpdate=!0}set needsPMREMUpdate(e){if(e===!0)this.pmremVersion++}}_t.DEFAULT_IMAGE=null;_t.DEFAULT_MAPPING=300;_t.DEFAULT_ANISOTROPY=1;class ot{static{ot.prototype.isVector4=!0}constructor(e=0,t=0,n=0,i=1){this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=this.w,s=e.elements;return this.x=s[0]*t+s[4]*n+s[8]*i+s[12]*r,this.y=s[1]*t+s[5]*n+s[9]*i+s[13]*r,this.z=s[2]*t+s[6]*n+s[10]*i+s[14]*r,this.w=s[3]*t+s[7]*n+s[11]*i+s[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);if(t<0.0001)this.x=1,this.y=0,this.z=0;else this.x=e.x/t,this.y=e.y/t,this.z=e.z/t;return this}setAxisAngleFromRotationMatrix(e){let t,n,i,r,s=0.01,o=0.1,a=e.elements,c=a[0],l=a[4],u=a[8],d=a[1],h=a[5],f=a[9],g=a[2],S=a[6],p=a[10];if(Math.abs(l-d)<0.01&&Math.abs(u-g)<0.01&&Math.abs(f-S)<0.01){if(Math.abs(l+d)<0.1&&Math.abs(u+g)<0.1&&Math.abs(f+S)<0.1&&Math.abs(c+h+p-3)<0.1)return this.set(1,0,0,0),this;t=Math.PI;let T=(c+1)/2,A=(h+1)/2,v=(p+1)/2,w=(l+d)/4,E=(u+g)/4,R=(f+S)/4;if(T>A&&T>v)if(T<0.01)n=0,i=0.707106781,r=0.707106781;else n=Math.sqrt(T),i=w/n,r=E/n;else if(A>v)if(A<0.01)n=0.707106781,i=0,r=0.707106781;else i=Math.sqrt(A),n=w/i,r=R/i;else if(v<0.01)n=0.707106781,i=0.707106781,r=0;else r=Math.sqrt(v),n=E/r,i=R/r;return this.set(n,i,r,t),this}let m=Math.sqrt((S-f)*(S-f)+(u-g)*(u-g)+(d-l)*(d-l));if(Math.abs(m)<0.001)m=1;return this.x=(S-f)/m,this.y=(u-g)/m,this.z=(d-l)/m,this.w=Math.acos((c+h+p-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Ze(this.x,e.x,t.x),this.y=Ze(this.y,e.y,t.y),this.z=Ze(this.z,e.z,t.z),this.w=Ze(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Ze(this.x,e,t),this.y=Ze(this.y,e,t),this.z=Ze(this.z,e,t),this.w=Ze(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Ze(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class Fl extends kn{constructor(e=1,t=1,n={}){super();n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:1006,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new ot(0,0,e,t),this.scissorTest=!1,this.viewport=new ot(0,0,e,t),this.textures=[];let i={width:e,height:t,depth:n.depth},r=new _t(i),s=n.count;for(let o=0;o<s;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:1006,generateMipmaps:!1,flipY:!1,internalFormat:null};if(e.mapping!==void 0)t.mapping=e.mapping;if(e.wrapS!==void 0)t.wrapS=e.wrapS;if(e.wrapT!==void 0)t.wrapT=e.wrapT;if(e.wrapR!==void 0)t.wrapR=e.wrapR;if(e.magFilter!==void 0)t.magFilter=e.magFilter;if(e.minFilter!==void 0)t.minFilter=e.minFilter;if(e.format!==void 0)t.format=e.format;if(e.type!==void 0)t.type=e.type;if(e.anisotropy!==void 0)t.anisotropy=e.anisotropy;if(e.colorSpace!==void 0)t.colorSpace=e.colorSpace;if(e.flipY!==void 0)t.flipY=e.flipY;if(e.generateMipmaps!==void 0)t.generateMipmaps=e.generateMipmaps;if(e.internalFormat!==void 0)t.internalFormat=e.internalFormat;for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){if(this._depthTexture!==null&&this._depthTexture.renderTarget===this)this._depthTexture.renderTarget=null;if(e!==null&&e.renderTarget===null)e.renderTarget=this;this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)if(this.textures[i].image.width=e,this.textures[i].image.height=t,this.textures[i].image.depth=n,this.textures[i].isData3DTexture!==!0)this.textures[i].isArrayTexture=this.textures[i].image.depth>1;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let i=Object.assign({},e.textures[t].image);this.textures[t].source=new Ts(i)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null)if(e.depthTexture.renderTarget===e){let t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture;return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class an extends Fl{constructor(e=1,t=1,n={}){super(e,t,n);this.isWebGLRenderTarget=!0}}class aa extends _t{constructor(e=null,t=1,n=1,i=1){super(null);this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=1003,this.minFilter=1003,this.wrapR=1001,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class zl extends _t{constructor(e=null,t=1,n=1,i=1){super(null);this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=1003,this.minFilter=1003,this.wrapR=1001,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}}class Oe{static{Oe.prototype.isMatrix4=!0}constructor(e,t,n,i,r,s,o,a,c,l,u,d,h,f,g,S){if(this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0)this.set(e,t,n,i,r,s,o,a,c,l,u,d,h,f,g,S)}set(e,t,n,i,r,s,o,a,c,l,u,d,h,f,g,S){let p=this.elements;return p[0]=e,p[4]=t,p[8]=n,p[12]=i,p[1]=r,p[5]=s,p[9]=o,p[13]=a,p[2]=c,p[6]=l,p[10]=u,p[14]=d,p[3]=h,p[7]=f,p[11]=g,p[15]=S,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Oe().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){if(this.determinantAffine()===0)return e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this;return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,n=e.elements,i=1/fr.setFromMatrixColumn(e,0).length(),r=1/fr.setFromMatrixColumn(e,1).length(),s=1/fr.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*s,t[9]=n[9]*s,t[10]=n[10]*s,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,{x:n,y:i,z:r}=e,s=Math.cos(n),o=Math.sin(n),a=Math.cos(i),c=Math.sin(i),l=Math.cos(r),u=Math.sin(r);if(e.order==="XYZ"){let d=s*l,h=s*u,f=o*l,g=o*u;t[0]=a*l,t[4]=-a*u,t[8]=c,t[1]=h+f*c,t[5]=d-g*c,t[9]=-o*a,t[2]=g-d*c,t[6]=f+h*c,t[10]=s*a}else if(e.order==="YXZ"){let d=a*l,h=a*u,f=c*l,g=c*u;t[0]=d+g*o,t[4]=f*o-h,t[8]=s*c,t[1]=s*u,t[5]=s*l,t[9]=-o,t[2]=h*o-f,t[6]=g+d*o,t[10]=s*a}else if(e.order==="ZXY"){let d=a*l,h=a*u,f=c*l,g=c*u;t[0]=d-g*o,t[4]=-s*u,t[8]=f+h*o,t[1]=h+f*o,t[5]=s*l,t[9]=g-d*o,t[2]=-s*c,t[6]=o,t[10]=s*a}else if(e.order==="ZYX"){let d=s*l,h=s*u,f=o*l,g=o*u;t[0]=a*l,t[4]=f*c-h,t[8]=d*c+g,t[1]=a*u,t[5]=g*c+d,t[9]=h*c-f,t[2]=-c,t[6]=o*a,t[10]=s*a}else if(e.order==="YZX"){let d=s*a,h=s*c,f=o*a,g=o*c;t[0]=a*l,t[4]=g-d*u,t[8]=f*u+h,t[1]=u,t[5]=s*l,t[9]=-o*l,t[2]=-c*l,t[6]=h*u+f,t[10]=d-g*u}else if(e.order==="XZY"){let d=s*a,h=s*c,f=o*a,g=o*c;t[0]=a*l,t[4]=-u,t[8]=c*l,t[1]=d*u+g,t[5]=s*l,t[9]=h*u-f,t[2]=f*u-h,t[6]=o*l,t[10]=g*u+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Cx,e,Ix)}lookAt(e,t,n){let i=this.elements;if(nn.subVectors(e,t),nn.lengthSq()===0)nn.z=1;if(nn.normalize(),mi.crossVectors(n,nn),mi.lengthSq()===0){if(Math.abs(n.z)===1)nn.x+=0.0001;else nn.z+=0.0001;nn.normalize(),mi.crossVectors(n,nn)}return mi.normalize(),_o.crossVectors(nn,mi),i[0]=mi.x,i[4]=_o.x,i[8]=nn.x,i[1]=mi.y,i[5]=_o.y,i[9]=nn.y,i[2]=mi.z,i[6]=_o.z,i[10]=nn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,s=n[0],o=n[4],a=n[8],c=n[12],l=n[1],u=n[5],d=n[9],h=n[13],f=n[2],g=n[6],S=n[10],p=n[14],m=n[3],T=n[7],A=n[11],v=n[15],w=i[0],E=i[4],R=i[8],x=i[12],M=i[1],H=i[5],O=i[9],z=i[13],D=i[2],C=i[6],F=i[10],Z=i[14],G=i[3],ie=i[7],X=i[11],Q=i[15];return r[0]=s*w+o*M+a*D+c*G,r[4]=s*E+o*H+a*C+c*ie,r[8]=s*R+o*O+a*F+c*X,r[12]=s*x+o*z+a*Z+c*Q,r[1]=l*w+u*M+d*D+h*G,r[5]=l*E+u*H+d*C+h*ie,r[9]=l*R+u*O+d*F+h*X,r[13]=l*x+u*z+d*Z+h*Q,r[2]=f*w+g*M+S*D+p*G,r[6]=f*E+g*H+S*C+p*ie,r[10]=f*R+g*O+S*F+p*X,r[14]=f*x+g*z+S*Z+p*Q,r[3]=m*w+T*M+A*D+v*G,r[7]=m*E+T*H+A*C+v*ie,r[11]=m*R+T*O+A*F+v*X,r[15]=m*x+T*z+A*Z+v*Q,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[12],s=e[1],o=e[5],a=e[9],c=e[13],l=e[2],u=e[6],d=e[10],h=e[14],f=e[3],g=e[7],S=e[11],p=e[15],m=a*h-c*d,T=o*h-c*u,A=o*d-a*u,v=s*h-c*l,w=s*d-a*l,E=s*u-o*l;return t*(g*m-S*T+p*A)-n*(f*m-S*v+p*w)+i*(f*T-g*v+p*E)-r*(f*A-g*w+S*E)}determinantAffine(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[1],s=e[5],o=e[9],a=e[2],c=e[6],l=e[10];return t*(s*l-o*c)-n*(r*l-o*a)+i*(r*c-s*a)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let i=this.elements;if(e.isVector3)i[12]=e.x,i[13]=e.y,i[14]=e.z;else i[12]=e,i[13]=t,i[14]=n;return this}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],s=e[4],o=e[5],a=e[6],c=e[7],l=e[8],u=e[9],d=e[10],h=e[11],f=e[12],g=e[13],S=e[14],p=e[15],m=t*o-n*s,T=t*a-i*s,A=t*c-r*s,v=n*a-i*o,w=n*c-r*o,E=i*c-r*a,R=l*g-u*f,x=l*S-d*f,M=l*p-h*f,H=u*S-d*g,O=u*p-h*g,z=d*p-h*S,D=m*z-T*O+A*H+v*M-w*x+E*R;if(D===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let C=1/D;return e[0]=(o*z-a*O+c*H)*C,e[1]=(i*O-n*z-r*H)*C,e[2]=(g*E-S*w+p*v)*C,e[3]=(d*w-u*E-h*v)*C,e[4]=(a*M-s*z-c*x)*C,e[5]=(t*z-i*M+r*x)*C,e[6]=(S*A-f*E-p*T)*C,e[7]=(l*E-d*A+h*T)*C,e[8]=(s*O-o*M+c*R)*C,e[9]=(n*M-t*O-r*R)*C,e[10]=(f*w-g*A+p*m)*C,e[11]=(u*A-l*w-h*m)*C,e[12]=(o*x-s*H-a*R)*C,e[13]=(t*H-n*x+i*R)*C,e[14]=(g*T-f*v-S*m)*C,e[15]=(l*v-u*T+d*m)*C,this}scale(e){let t=this.elements,{x:n,y:i,z:r}=e;return t[0]*=n,t[4]*=i,t[8]*=r,t[1]*=n,t[5]*=i,t[9]*=r,t[2]*=n,t[6]*=i,t[10]*=r,t[3]*=n,t[7]*=i,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){if(e.isVector3)this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1);else this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1);return this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),i=Math.sin(t),r=1-n,{x:s,y:o,z:a}=e,c=r*s,l=r*o;return this.set(c*s+n,c*o-i*a,c*a+i*o,0,c*o+i*a,l*o+n,l*a-i*s,0,c*a-i*o,l*a+i*s,r*a*a+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,i,r,s){return this.set(1,n,r,0,e,1,s,0,t,i,1,0,0,0,0,1),this}compose(e,t,n){let i=this.elements,{_x:r,_y:s,_z:o,_w:a}=t,c=r+r,l=s+s,u=o+o,d=r*c,h=r*l,f=r*u,g=s*l,S=s*u,p=o*u,m=a*c,T=a*l,A=a*u,{x:v,y:w,z:E}=n;return i[0]=(1-(g+p))*v,i[1]=(h+A)*v,i[2]=(f-T)*v,i[3]=0,i[4]=(h-A)*w,i[5]=(1-(d+p))*w,i[6]=(S+m)*w,i[7]=0,i[8]=(f+T)*E,i[9]=(S-m)*E,i[10]=(1-(d+g))*E,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){let i=this.elements;e.x=i[12],e.y=i[13],e.z=i[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),t.identity(),this;let s=fr.set(i[0],i[1],i[2]).length(),o=fr.set(i[4],i[5],i[6]).length(),a=fr.set(i[8],i[9],i[10]).length();if(r<0)s=-s;vn.copy(this);let c=1/s,l=1/o,u=1/a;return vn.elements[0]*=c,vn.elements[1]*=c,vn.elements[2]*=c,vn.elements[4]*=l,vn.elements[5]*=l,vn.elements[6]*=l,vn.elements[8]*=u,vn.elements[9]*=u,vn.elements[10]*=u,t.setFromRotationMatrix(vn),n.x=s,n.y=o,n.z=a,this}makePerspective(e,t,n,i,r,s,o=2000,a=!1){let c=this.elements,l=2*r/(t-e),u=2*r/(n-i),d=(t+e)/(t-e),h=(n+i)/(n-i),f,g;if(a)f=r/(s-r),g=s*r/(s-r);else if(o===2000)f=-(s+r)/(s-r),g=-2*s*r/(s-r);else if(o===2001)f=-s/(s-r),g=-s*r/(s-r);else throw Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=l,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=h,c[13]=0,c[2]=0,c[6]=0,c[10]=f,c[14]=g,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,i,r,s,o=2000,a=!1){let c=this.elements,l=2/(t-e),u=2/(n-i),d=-(t+e)/(t-e),h=-(n+i)/(n-i),f,g;if(a)f=1/(s-r),g=s/(s-r);else if(o===2000)f=-2/(s-r),g=-(s+r)/(s-r);else if(o===2001)f=-1/(s-r),g=-r/(s-r);else throw Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=l,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=h,c[2]=0,c[6]=0,c[10]=f,c[14]=g,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}}var fr=new U,vn=new Oe,Cx=new U(0,0,0),Ix=new U(1,1,1),mi=new U,_o=new U,nn=new U,Cp=new Oe,Ip=new Gt;class ii{constructor(e=0,t=0,n=0,i=ii.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i=this._order){return this._x=e,this._y=t,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let i=e.elements,r=i[0],s=i[4],o=i[8],a=i[1],c=i[5],l=i[9],u=i[2],d=i[6],h=i[10];switch(t){case"XYZ":if(this._y=Math.asin(Ze(o,-1,1)),Math.abs(o)<0.9999999)this._x=Math.atan2(-l,h),this._z=Math.atan2(-s,r);else this._x=Math.atan2(d,c),this._z=0;break;case"YXZ":if(this._x=Math.asin(-Ze(l,-1,1)),Math.abs(l)<0.9999999)this._y=Math.atan2(o,h),this._z=Math.atan2(a,c);else this._y=Math.atan2(-u,r),this._z=0;break;case"ZXY":if(this._x=Math.asin(Ze(d,-1,1)),Math.abs(d)<0.9999999)this._y=Math.atan2(-u,h),this._z=Math.atan2(-s,c);else this._y=0,this._z=Math.atan2(a,r);break;case"ZYX":if(this._y=Math.asin(-Ze(u,-1,1)),Math.abs(u)<0.9999999)this._x=Math.atan2(d,h),this._z=Math.atan2(a,r);else this._x=0,this._z=Math.atan2(-s,c);break;case"YZX":if(this._z=Math.asin(Ze(a,-1,1)),Math.abs(a)<0.9999999)this._x=Math.atan2(-l,c),this._y=Math.atan2(-u,r);else this._x=0,this._y=Math.atan2(o,h);break;case"XZY":if(this._z=Math.asin(-Ze(s,-1,1)),Math.abs(s)<0.9999999)this._x=Math.atan2(d,c),this._y=Math.atan2(o,r);else this._x=Math.atan2(-l,h),this._y=0;break;default:Te("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}if(this._order=t,n===!0)this._onChangeCallback();return this}setFromQuaternion(e,t,n){return Cp.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Cp,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Ip.setFromEuler(this),this.setFromQuaternion(Ip,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){if(this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0)this._order=e[3];return this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}ii.DEFAULT_ORDER="XYZ";class Es{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}var Px=0,Pp=new U,pr=new Gt,Jn=new Oe,xo=new U,os=new U,Lx=new U,Nx=new Gt,Lp=new U(1,0,0),Np=new U(0,1,0),Dp=new U(0,0,1),Up={type:"added"},Dx={type:"removed"},mr={type:"childadded",child:null},hc={type:"childremoved",child:null};class lt extends kn{constructor(){super();this.isObject3D=!0,Object.defineProperty(this,"id",{value:Px++}),this.uuid=Mn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=lt.DEFAULT_UP.clone();let e=new U,t=new ii,n=new Gt,i=new U(1,1,1);function r(){n.setFromEuler(t,!1)}function s(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(s),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Oe},normalMatrix:{value:new Fe}}),this.matrix=new Oe,this.matrixWorld=new Oe,this.matrixAutoUpdate=lt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=lt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Es,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){if(this.matrixAutoUpdate)this.updateMatrix();this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return pr.setFromAxisAngle(e,t),this.quaternion.multiply(pr),this}rotateOnWorldAxis(e,t){return pr.setFromAxisAngle(e,t),this.quaternion.premultiply(pr),this}rotateX(e){return this.rotateOnAxis(Lp,e)}rotateY(e){return this.rotateOnAxis(Np,e)}rotateZ(e){return this.rotateOnAxis(Dp,e)}translateOnAxis(e,t){return Pp.copy(e).applyQuaternion(this.quaternion),this.position.add(Pp.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Lp,e)}translateY(e){return this.translateOnAxis(Np,e)}translateZ(e){return this.translateOnAxis(Dp,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Jn.copy(this.matrixWorld).invert())}lookAt(e,t,n){if(e.isVector3)xo.copy(e);else xo.set(e,t,n);let i=this.parent;if(this.updateWorldMatrix(!0,!1),os.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight)Jn.lookAt(os,xo,this.up);else Jn.lookAt(xo,os,this.up);if(this.quaternion.setFromRotationMatrix(Jn),i)Jn.extractRotation(i.matrixWorld),pr.setFromRotationMatrix(Jn),this.quaternion.premultiply(pr.invert())}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}if(e===this)return Ne("Object3D.add: object can't be added as a child of itself.",e),this;if(e&&e.isObject3D)e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Up),mr.child=e,this.dispatchEvent(mr),mr.child=null;else Ne("Object3D.add: object not an instance of THREE.Object3D.",e);return this}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);if(t!==-1)e.parent=null,this.children.splice(t,1),e.dispatchEvent(Dx),hc.child=e,this.dispatchEvent(hc),hc.child=null;return this}removeFromParent(){let e=this.parent;if(e!==null)e.remove(this);return this}clear(){return this.remove(...this.children)}attach(e){if(this.updateWorldMatrix(!0,!1),Jn.copy(this.matrixWorld).invert(),e.parent!==null)e.parent.updateWorldMatrix(!0,!1),Jn.multiply(e.parent.matrixWorld);return e.applyMatrix4(Jn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Up),mr.child=e,this.dispatchEvent(mr),mr.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){let s=this.children[n].getObjectByProperty(e,t);if(s!==void 0)return s}return}getObjectsByProperty(e,t,n=[]){if(this[e]===t)n.push(this);let i=this.children;for(let r=0,s=i.length;r<s;r++)i[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(os,e,Lx),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(os,Nx,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(e){e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;if(t!==null)e(t),t.traverseAncestors(e)}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let{x:t,y:n,z:i}=e,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*n-r[8]*i,r[13]+=n-r[1]*t-r[5]*n-r[9]*i,r[14]+=i-r[2]*t-r[6]*n-r[10]*i}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){if(this.matrixAutoUpdate)this.updateMatrix();if(this.matrixWorldNeedsUpdate||e){if(this.matrixWorldAutoUpdate===!0)if(this.parent===null)this.matrixWorld.copy(this.matrix);else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix);this.matrixWorldNeedsUpdate=!1,e=!0}let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){let i=this.parent;if(e===!0&&i!==null)i.updateWorldMatrix(!0,!1);if(this.matrixAutoUpdate)this.updateMatrix();if(this.matrixWorldNeedsUpdate||n){if(this.matrixWorldAutoUpdate===!0)if(this.parent===null)this.matrixWorld.copy(this.matrix);else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix);this.matrixWorldNeedsUpdate=!1,n=!0}if(t===!0){let r=this.children;for(let s=0,o=r.length;s<o;s++)r[s].updateWorldMatrix(!1,!0,n)}}toJSON(e){let t=e===void 0||typeof e==="string",n={};if(t)e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"};let i={};if(i.uuid=this.uuid,i.type=this.type,i.name=this.name,i.castShadow=this.castShadow,i.receiveShadow=this.receiveShadow,i.visible=this.visible,i.frustumCulled=this.frustumCulled,i.renderOrder=this.renderOrder,i.static=this.static,i.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0)i.userData=this.userData;if(i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.pivot!==null)i.pivot=this.pivot.toArray();if(this.morphTargetDictionary!==void 0)i.morphTargetDictionary=Object.assign({},this.morphTargetDictionary);if(this.morphTargetInfluences!==void 0)i.morphTargetInfluences=this.morphTargetInfluences.slice();if(this.isInstancedMesh){if(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null)i.instanceColor=this.instanceColor.toJSON()}if(this.isBatchedMesh){if(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map((o)=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map((o)=>({...o})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(e),i.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null)i.colorsTexture=this._colorsTexture.toJSON(e);if(this.boundingSphere!==null)i.boundingSphere=this.boundingSphere.toJSON();if(this.boundingBox!==null)i.boundingBox=this.boundingBox.toJSON()}function r(o,a){if(o[a.uuid]===void 0)o[a.uuid]=a.toJSON(e);return a.uuid}if(this.isScene){if(this.background){if(this.background.isColor)i.background=this.background.toJSON();else if(this.background.isTexture)i.background=this.background.toJSON(e).uuid}if(this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0)i.environment=this.environment.toJSON(e).uuid}else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(e.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let a=o.shapes;if(Array.isArray(a))for(let c=0,l=a.length;c<l;c++){let u=a[c];r(e.shapes,u)}else r(e.shapes,a)}}if(this.isSkinnedMesh){if(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0)r(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid}if(this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let a=0,c=this.material.length;a<c;a++)o.push(r(e.materials,this.material[a]));i.material=o}else i.material=r(e.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){let a=this.animations[o];i.animations.push(r(e.animations,a))}}if(t){let o=s(e.geometries),a=s(e.materials),c=s(e.textures),l=s(e.images),u=s(e.shapes),d=s(e.skeletons),h=s(e.animations),f=s(e.nodes);if(o.length>0)n.geometries=o;if(a.length>0)n.materials=a;if(c.length>0)n.textures=c;if(l.length>0)n.images=l;if(u.length>0)n.shapes=u;if(d.length>0)n.skeletons=d;if(h.length>0)n.animations=h;if(f.length>0)n.nodes=f}return n.object=i,n;function s(o){let a=[];for(let c in o){let l=o[c];delete l.metadata,a.push(l)}return a}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let i=e.children[n];this.add(i.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}}lt.DEFAULT_UP=new U(0,1,0);lt.DEFAULT_MATRIX_AUTO_UPDATE=!0;lt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class Kt extends lt{constructor(){super();this.isGroup=!0,this.type="Group"}}var Ux={type:"move"};class As{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){if(this._hand===null)this._hand=new Kt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1};return this._hand}getTargetRaySpace(){if(this._targetRay===null)this._targetRay=new Kt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new U,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new U;return this._targetRay}getGripSpace(){if(this._grip===null)this._grip=new Kt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new U,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new U,this._grip.eventsEnabled=!1;return this._grip}dispatchEvent(e){if(this._targetRay!==null)this._targetRay.dispatchEvent(e);if(this._grip!==null)this._grip.dispatchEvent(e);if(this._hand!==null)this._hand.dispatchEvent(e);return this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){if(this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null)this._targetRay.visible=!1;if(this._grip!==null)this._grip.visible=!1;if(this._hand!==null)this._hand.visible=!1;return this}update(e,t,n){let i=null,r=null,s=null,o=this._targetRay,a=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){s=!0;for(let g of e.hand.values()){let S=t.getJointPose(g,n),p=this._getHandJoint(c,g);if(S!==null)p.matrix.fromArray(S.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=S.radius;p.visible=S!==null}let l=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],d=l.position.distanceTo(u.position),h=0.02,f=0.005;if(c.inputState.pinching&&d>h+f)c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this});else if(!c.inputState.pinching&&d<=h-f)c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this})}else if(a!==null&&e.gripSpace){if(r=t.getPose(e.gripSpace,n),r!==null){if(a.matrix.fromArray(r.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,r.linearVelocity)a.hasLinearVelocity=!0,a.linearVelocity.copy(r.linearVelocity);else a.hasLinearVelocity=!1;if(r.angularVelocity)a.hasAngularVelocity=!0,a.angularVelocity.copy(r.angularVelocity);else a.hasAngularVelocity=!1;if(a.eventsEnabled)a.dispatchEvent({type:"gripUpdated",data:e,target:this})}}if(o!==null){if(i=t.getPose(e.targetRaySpace,n),i===null&&r!==null)i=r;if(i!==null){if(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity)o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity);else o.hasLinearVelocity=!1;if(i.angularVelocity)o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity);else o.hasAngularVelocity=!1;this.dispatchEvent(Ux)}}}if(o!==null)o.visible=i!==null;if(a!==null)a.visible=r!==null;if(c!==null)c.visible=s!==null;return this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new Kt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}var lg={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},gi={h:0,s:0,l:0},vo={h:0,s:0,l:0};function dc(e,t,n){if(n<0)n+=1;if(n>1)n-=1;if(n<0.16666666666666666)return e+(t-e)*6*n;if(n<0.5)return t;if(n<0.6666666666666666)return e+(t-e)*6*(0.6666666666666666-n);return e}class Re{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let i=e;if(i&&i.isColor)this.copy(i);else if(typeof i==="number")this.setHex(i);else if(typeof i==="string")this.setStyle(i)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t="srgb"){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,He.colorSpaceToWorking(this,t),this}setRGB(e,t,n,i=He.workingColorSpace){return this.r=e,this.g=t,this.b=n,He.colorSpaceToWorking(this,i),this}setHSL(e,t,n,i=He.workingColorSpace){if(e=Ul(e,1),t=Ze(t,0,1),n=Ze(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=0.5?n*(1+t):n+t-n*t,s=2*n-r;this.r=dc(s,r,e+0.3333333333333333),this.g=dc(s,r,e),this.b=dc(s,r,e-0.3333333333333333)}return He.colorSpaceToWorking(this,i),this}setStyle(e,t="srgb"){function n(r){if(r===void 0)return;if(parseFloat(r)<1)Te("Color: Alpha component of "+e+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(e)){let r,s=i[1],o=i[2];switch(s){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:Te("Color: Unknown color model "+e)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(e)){let r=i[1],s=r.length;if(s===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);else if(s===6)return this.setHex(parseInt(r,16),t);else Te("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t="srgb"){let n=lg[e.toLowerCase()];if(n!==void 0)this.setHex(n,t);else Te("Color: Unknown color "+e);return this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=ni(e.r),this.g=ni(e.g),this.b=ni(e.b),this}copyLinearToSRGB(e){return this.r=Ir(e.r),this.g=Ir(e.g),this.b=Ir(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e="srgb"){return He.workingToColorSpace(Wt.copy(this),e),Math.round(Ze(Wt.r*255,0,255))*65536+Math.round(Ze(Wt.g*255,0,255))*256+Math.round(Ze(Wt.b*255,0,255))}getHexString(e="srgb"){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=He.workingColorSpace){He.workingToColorSpace(Wt.copy(this),t);let{r:n,g:i,b:r}=Wt,s=Math.max(n,i,r),o=Math.min(n,i,r),a,c,l=(o+s)/2;if(o===s)a=0,c=0;else{let u=s-o;switch(c=l<=0.5?u/(s+o):u/(2-s-o),s){case n:a=(i-r)/u+(i<r?6:0);break;case i:a=(r-n)/u+2;break;case r:a=(n-i)/u+4;break}a/=6}return e.h=a,e.s=c,e.l=l,e}getRGB(e,t=He.workingColorSpace){return He.workingToColorSpace(Wt.copy(this),t),e.r=Wt.r,e.g=Wt.g,e.b=Wt.b,e}getStyle(e="srgb"){He.workingToColorSpace(Wt.copy(this),e);let{r:t,g:n,b:i}=Wt;if(e!=="srgb")return`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`;return`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(e,t,n){return this.getHSL(gi),this.setHSL(gi.h+e,gi.s+t,gi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(gi),e.getHSL(vo);let n=xs(gi.h,vo.h,t),i=xs(gi.s,vo.s,t),r=xs(gi.l,vo.l,t);return this.setHSL(n,i,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,i=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*i,this.g=r[1]*t+r[4]*n+r[7]*i,this.b=r[2]*t+r[5]*n+r[8]*i,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}var Wt=new Re;Re.NAMES=lg;class Rs extends lt{constructor(){super();if(this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new ii,this.environmentIntensity=1,this.environmentRotation=new ii,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){if(super.copy(e,t),e.background!==null)this.background=e.background.clone();if(e.environment!==null)this.environment=e.environment.clone();if(e.fog!==null)this.fog=e.fog.clone();if(this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null)this.overrideMaterial=e.overrideMaterial.clone();return this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);if(this.fog!==null)t.object.fog=this.fog.toJSON();return t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}}var yn=new U,Kn=new U,fc=new U,jn=new U,gr=new U,_r=new U,Op=new U,pc=new U,mc=new U,gc=new U,_c=new ot,xc=new ot,vc=new ot;class sn{constructor(e=new U,t=new U,n=new U){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i.subVectors(n,t),yn.subVectors(e,t),i.cross(yn);let r=i.lengthSq();if(r>0)return i.multiplyScalar(1/Math.sqrt(r));return i.set(0,0,0)}static getBarycoord(e,t,n,i,r){yn.subVectors(i,t),Kn.subVectors(n,t),fc.subVectors(e,t);let s=yn.dot(yn),o=yn.dot(Kn),a=yn.dot(fc),c=Kn.dot(Kn),l=Kn.dot(fc),u=s*c-o*o;if(u===0)return r.set(0,0,0),null;let d=1/u,h=(c*a-o*l)*d,f=(s*l-o*a)*d;return r.set(1-h-f,f,h)}static containsPoint(e,t,n,i){if(this.getBarycoord(e,t,n,i,jn)===null)return!1;return jn.x>=0&&jn.y>=0&&jn.x+jn.y<=1}static getInterpolation(e,t,n,i,r,s,o,a){if(this.getBarycoord(e,t,n,i,jn)===null){if(a.x=0,a.y=0,"z"in a)a.z=0;if("w"in a)a.w=0;return null}return a.setScalar(0),a.addScaledVector(r,jn.x),a.addScaledVector(s,jn.y),a.addScaledVector(o,jn.z),a}static getInterpolatedAttribute(e,t,n,i,r,s){return _c.setScalar(0),xc.setScalar(0),vc.setScalar(0),_c.fromBufferAttribute(e,t),xc.fromBufferAttribute(e,n),vc.fromBufferAttribute(e,i),s.setScalar(0),s.addScaledVector(_c,r.x),s.addScaledVector(xc,r.y),s.addScaledVector(vc,r.z),s}static isFrontFacing(e,t,n,i){return yn.subVectors(n,t),Kn.subVectors(e,t),yn.cross(Kn).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}setFromAttributeAndIndices(e,t,n,i){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return yn.subVectors(this.c,this.b),Kn.subVectors(this.a,this.b),yn.cross(Kn).length()*0.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(0.3333333333333333)}getNormal(e){return sn.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return sn.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,i,r){return sn.getInterpolation(e,this.a,this.b,this.c,t,n,i,r)}containsPoint(e){return sn.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return sn.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,i=this.b,r=this.c,s,o;gr.subVectors(i,n),_r.subVectors(r,n),pc.subVectors(e,n);let a=gr.dot(pc),c=_r.dot(pc);if(a<=0&&c<=0)return t.copy(n);mc.subVectors(e,i);let l=gr.dot(mc),u=_r.dot(mc);if(l>=0&&u<=l)return t.copy(i);let d=a*u-l*c;if(d<=0&&a>=0&&l<=0)return s=a/(a-l),t.copy(n).addScaledVector(gr,s);gc.subVectors(e,r);let h=gr.dot(gc),f=_r.dot(gc);if(f>=0&&h<=f)return t.copy(r);let g=h*c-a*f;if(g<=0&&c>=0&&f<=0)return o=c/(c-f),t.copy(n).addScaledVector(_r,o);let S=l*f-h*u;if(S<=0&&u-l>=0&&h-f>=0)return Op.subVectors(r,i),o=(u-l)/(u-l+(h-f)),t.copy(i).addScaledVector(Op,o);let p=1/(S+g+d);return s=g*p,o=d*p,t.copy(n).addScaledVector(gr,s).addScaledVector(_r,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class _n{constructor(e=new U(1/0,1/0,1/0),t=new U(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Sn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Sn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=Sn.copy(t).multiplyScalar(0.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(0.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let s=0,o=r.count;s<o;s++){if(e.isMesh===!0)e.getVertexPosition(s,Sn);else Sn.fromBufferAttribute(r,s);Sn.applyMatrix4(e.matrixWorld),this.expandByPoint(Sn)}else{if(e.boundingBox!==void 0){if(e.boundingBox===null)e.computeBoundingBox();yo.copy(e.boundingBox)}else{if(n.boundingBox===null)n.computeBoundingBox();yo.copy(n.boundingBox)}yo.applyMatrix4(e.matrixWorld),this.union(yo)}}let i=e.children;for(let r=0,s=i.length;r<s;r++)this.expandByObject(i[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Sn),Sn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;if(e.normal.x>0)t=e.normal.x*this.min.x,n=e.normal.x*this.max.x;else t=e.normal.x*this.max.x,n=e.normal.x*this.min.x;if(e.normal.y>0)t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y;else t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y;if(e.normal.z>0)t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z;else t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z;return t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(as),So.subVectors(this.max,as),xr.subVectors(e.a,as),vr.subVectors(e.b,as),yr.subVectors(e.c,as),_i.subVectors(vr,xr),xi.subVectors(yr,vr),Bi.subVectors(xr,yr);let t=[0,-_i.z,_i.y,0,-xi.z,xi.y,0,-Bi.z,Bi.y,_i.z,0,-_i.x,xi.z,0,-xi.x,Bi.z,0,-Bi.x,-_i.y,_i.x,0,-xi.y,xi.x,0,-Bi.y,Bi.x,0];if(!yc(t,xr,vr,yr,So))return!1;if(t=[1,0,0,0,1,0,0,0,1],!yc(t,xr,vr,yr,So))return!1;return bo.crossVectors(_i,xi),t=[bo.x,bo.y,bo.z],yc(t,xr,vr,yr,So)}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Sn).distanceTo(e)}getBoundingSphere(e){if(this.isEmpty())e.makeEmpty();else this.getCenter(e.center),e.radius=this.getSize(Sn).length()*0.5;return e}intersect(e){if(this.min.max(e.min),this.max.min(e.max),this.isEmpty())this.makeEmpty();return this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){if(this.isEmpty())return this;return Qn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Qn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Qn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Qn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Qn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Qn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Qn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Qn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Qn),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}var Qn=[new U,new U,new U,new U,new U,new U,new U,new U],Sn=new U,yo=new _n,xr=new U,vr=new U,yr=new U,_i=new U,xi=new U,Bi=new U,as=new U,So=new U,bo=new U,Gi=new U;function yc(e,t,n,i,r){for(let s=0,o=e.length-3;s<=o;s+=3){Gi.fromArray(e,s);let a=r.x*Math.abs(Gi.x)+r.y*Math.abs(Gi.y)+r.z*Math.abs(Gi.z),c=t.dot(Gi),l=n.dot(Gi),u=i.dot(Gi);if(Math.max(-Math.max(c,l,u),Math.min(c,l,u))>a)return!1}return!0}var Rt=new U,Mo=new Ue,Ox=0;class Ft extends kn{constructor(e,t,n=!1){super();if(Array.isArray(e))throw TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Ox++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=35044,this.updateRanges=[],this.gpuType=1015,this.version=0}onUploadCallback(){}set needsUpdate(e){if(e===!0)this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Mo.fromBufferAttribute(this,t),Mo.applyMatrix3(e),this.setXY(t,Mo.x,Mo.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Rt.fromBufferAttribute(this,t),Rt.applyMatrix3(e),this.setXYZ(t,Rt.x,Rt.y,Rt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Rt.fromBufferAttribute(this,t),Rt.applyMatrix4(e),this.setXYZ(t,Rt.x,Rt.y,Rt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Rt.fromBufferAttribute(this,t),Rt.applyNormalMatrix(e),this.setXYZ(t,Rt.x,Rt.y,Rt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Rt.fromBufferAttribute(this,t),Rt.transformDirection(e),this.setXYZ(t,Rt.x,Rt.y,Rt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];if(this.normalized)n=bn(n,this.array);return n}setComponent(e,t,n){if(this.normalized)n=st(n,this.array);return this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];if(this.normalized)t=bn(t,this.array);return t}setX(e,t){if(this.normalized)t=st(t,this.array);return this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];if(this.normalized)t=bn(t,this.array);return t}setY(e,t){if(this.normalized)t=st(t,this.array);return this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];if(this.normalized)t=bn(t,this.array);return t}setZ(e,t){if(this.normalized)t=st(t,this.array);return this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];if(this.normalized)t=bn(t,this.array);return t}setW(e,t){if(this.normalized)t=st(t,this.array);return this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){if(e*=this.itemSize,this.normalized)t=st(t,this.array),n=st(n,this.array);return this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){if(e*=this.itemSize,this.normalized)t=st(t,this.array),n=st(n,this.array),i=st(i,this.array);return this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,r){if(e*=this.itemSize,this.normalized)t=st(t,this.array),n=st(n,this.array),i=st(i,this.array),r=st(r,this.array);return this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:"dispose"})}}class ca extends Ft{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class la extends Ft{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class bt extends Ft{constructor(e,t,n){super(new Float32Array(e),t,n)}}var Fx=new _n,cs=new U,Sc=new U;class cn{constructor(e=new U,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;if(t!==void 0)n.copy(t);else Fx.setFromPoints(e).getCenter(n);let i=0;for(let r=0,s=e.length;r<s;r++)i=Math.max(i,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);if(t.copy(e),n>this.radius*this.radius)t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center);return t}getBoundingBox(e){if(this.isEmpty())return e.makeEmpty(),e;return e.set(this.center,this.center),e.expandByScalar(this.radius),e}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;cs.subVectors(e,this.center);let t=cs.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),i=(n-this.radius)*0.5;this.center.addScaledVector(cs,i/n),this.radius+=i}return this}union(e){if(e.isEmpty())return this;if(this.isEmpty())return this.copy(e),this;if(this.center.equals(e.center)===!0)this.radius=Math.max(this.radius,e.radius);else Sc.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(cs.copy(e.center).add(Sc)),this.expandByPoint(cs.copy(e.center).sub(Sc));return this}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}var zx=0,fn=new Oe,bc=new lt,Sr=new U,rn=new _n,ls=new _n,Ot=new U;class Mt extends kn{constructor(){super();this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:zx++}),this.uuid=Mn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){if(Array.isArray(e))this.index=new((cx(e))?la:ca)(e,1);else this.index=e;return this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;if(t!==void 0)t.applyMatrix4(e),t.needsUpdate=!0;let n=this.attributes.normal;if(n!==void 0){let r=new Fe().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;if(i!==void 0)i.transformDirection(e),i.needsUpdate=!0;if(this.boundingBox!==null)this.computeBoundingBox();if(this.boundingSphere!==null)this.computeBoundingSphere();return this._transformed=!0,this}applyQuaternion(e){return fn.makeRotationFromQuaternion(e),this.applyMatrix4(fn),this}rotateX(e){return fn.makeRotationX(e),this.applyMatrix4(fn),this}rotateY(e){return fn.makeRotationY(e),this.applyMatrix4(fn),this}rotateZ(e){return fn.makeRotationZ(e),this.applyMatrix4(fn),this}translate(e,t,n){return fn.makeTranslation(e,t,n),this.applyMatrix4(fn),this}scale(e,t,n){return fn.makeScale(e,t,n),this.applyMatrix4(fn),this}lookAt(e){return bc.lookAt(e),bc.updateMatrix(),this.applyMatrix4(bc.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Sr).negate(),this.translate(Sr.x,Sr.y,Sr.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let n=[];for(let i=0,r=e.length;i<r;i++){let s=e[i];n.push(s.x,s.y,s.z||0)}this.setAttribute("position",new bt(n,3))}else{let n=Math.min(e.length,t.count);for(let i=0;i<n;i++){let r=e[i];t.setXYZ(i,r.x,r.y,r.z||0)}if(e.length>t.count)Te("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.");t.needsUpdate=!0}return this}computeBoundingBox(){if(this.boundingBox===null)this.boundingBox=new _n;let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Ne("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new U(-1/0,-1/0,-1/0),new U(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){let r=t[n];if(rn.setFromBufferAttribute(r),this.morphTargetsRelative)Ot.addVectors(this.boundingBox.min,rn.min),this.boundingBox.expandByPoint(Ot),Ot.addVectors(this.boundingBox.max,rn.max),this.boundingBox.expandByPoint(Ot);else this.boundingBox.expandByPoint(rn.min),this.boundingBox.expandByPoint(rn.max)}}else this.boundingBox.makeEmpty();if(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))Ne('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){if(this.boundingSphere===null)this.boundingSphere=new cn;let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Ne("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new U,1/0);return}if(e){let n=this.boundingSphere.center;if(rn.setFromBufferAttribute(e),t)for(let r=0,s=t.length;r<s;r++){let o=t[r];if(ls.setFromBufferAttribute(o),this.morphTargetsRelative)Ot.addVectors(rn.min,ls.min),rn.expandByPoint(Ot),Ot.addVectors(rn.max,ls.max),rn.expandByPoint(Ot);else rn.expandByPoint(ls.min),rn.expandByPoint(ls.max)}rn.getCenter(n);let i=0;for(let r=0,s=e.count;r<s;r++)Ot.fromBufferAttribute(e,r),i=Math.max(i,n.distanceToSquared(Ot));if(t)for(let r=0,s=t.length;r<s;r++){let o=t[r],a=this.morphTargetsRelative;for(let c=0,l=o.count;c<l;c++){if(Ot.fromBufferAttribute(o,c),a)Sr.fromBufferAttribute(e,c),Ot.add(Sr);i=Math.max(i,n.distanceToSquared(Ot))}}if(this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius))Ne('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){Ne("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let{position:n,normal:i,uv:r}=t,s=this.getAttribute("tangent");if(s===void 0||s.count!==n.count)s=new Ft(new Float32Array(4*n.count),4),this.setAttribute("tangent",s);let o=[],a=[];for(let R=0;R<n.count;R++)o[R]=new U,a[R]=new U;let c=new U,l=new U,u=new U,d=new Ue,h=new Ue,f=new Ue,g=new U,S=new U;function p(R,x,M){c.fromBufferAttribute(n,R),l.fromBufferAttribute(n,x),u.fromBufferAttribute(n,M),d.fromBufferAttribute(r,R),h.fromBufferAttribute(r,x),f.fromBufferAttribute(r,M),l.sub(c),u.sub(c),h.sub(d),f.sub(d);let H=1/(h.x*f.y-f.x*h.y);if(!isFinite(H))return;g.copy(l).multiplyScalar(f.y).addScaledVector(u,-h.y).multiplyScalar(H),S.copy(u).multiplyScalar(h.x).addScaledVector(l,-f.x).multiplyScalar(H),o[R].add(g),o[x].add(g),o[M].add(g),a[R].add(S),a[x].add(S),a[M].add(S)}let m=this.groups;if(m.length===0)m=[{start:0,count:e.count}];for(let R=0,x=m.length;R<x;++R){let M=m[R],{start:H,count:O}=M;for(let z=H,D=H+O;z<D;z+=3)p(e.getX(z+0),e.getX(z+1),e.getX(z+2))}let T=new U,A=new U,v=new U,w=new U;function E(R){v.fromBufferAttribute(i,R),w.copy(v);let x=o[R];T.copy(x),T.sub(v.multiplyScalar(v.dot(x))).normalize(),A.crossVectors(w,x);let H=A.dot(a[R])<0?-1:1;s.setXYZW(R,T.x,T.y,T.z,H)}for(let R=0,x=m.length;R<x;++R){let M=m[R],{start:H,count:O}=M;for(let z=H,D=H+O;z<D;z+=3)E(e.getX(z+0)),E(e.getX(z+1)),E(e.getX(z+2))}this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==t.count)n=new Ft(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,h=n.count;d<h;d++)n.setXYZ(d,0,0,0);let i=new U,r=new U,s=new U,o=new U,a=new U,c=new U,l=new U,u=new U;if(e)for(let d=0,h=e.count;d<h;d+=3){let f=e.getX(d+0),g=e.getX(d+1),S=e.getX(d+2);i.fromBufferAttribute(t,f),r.fromBufferAttribute(t,g),s.fromBufferAttribute(t,S),l.subVectors(s,r),u.subVectors(i,r),l.cross(u),o.fromBufferAttribute(n,f),a.fromBufferAttribute(n,g),c.fromBufferAttribute(n,S),o.add(l),a.add(l),c.add(l),n.setXYZ(f,o.x,o.y,o.z),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(S,c.x,c.y,c.z)}else for(let d=0,h=t.count;d<h;d+=3)i.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),s.fromBufferAttribute(t,d+2),l.subVectors(s,r),u.subVectors(i,r),l.cross(u),n.setXYZ(d+0,l.x,l.y,l.z),n.setXYZ(d+1,l.x,l.y,l.z),n.setXYZ(d+2,l.x,l.y,l.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Ot.fromBufferAttribute(e,t),Ot.normalize(),e.setXYZ(t,Ot.x,Ot.y,Ot.z)}toNonIndexed(){function e(o,a){let{array:c,itemSize:l,normalized:u}=o,d=new c.constructor(a.length*l),h=0,f=0;for(let g=0,S=a.length;g<S;g++){if(o.isInterleavedBufferAttribute)h=a[g]*o.data.stride+o.offset;else h=a[g]*l;for(let p=0;p<l;p++)d[f++]=c[h++]}return new Ft(d,l,u)}if(this.index===null)return Te("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new Mt,n=this.index.array,i=this.attributes;for(let o in i){let a=i[o],c=e(a,n);t.setAttribute(o,c)}let r=this.morphAttributes;for(let o in r){let a=[],c=r[o];for(let l=0,u=c.length;l<u;l++){let d=c[l],h=e(d,n);a.push(h)}t.morphAttributes[o]=a}t.morphTargetsRelative=this.morphTargetsRelative;let s=this.groups;for(let o=0,a=s.length;o<a;o++){let c=s[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){let e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,e.name=this.name,Object.keys(this.userData).length>0)e.userData=this.userData;if(this.parameters!==void 0&&this._transformed!==!0){let a=this.parameters;for(let c in a)if(a[c]!==void 0)e[c]=a[c];return e}e.data={attributes:{}};let t=this.index;if(t!==null)e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)};let n=this.attributes;for(let a in n){let c=n[a];e.data.attributes[a]=c.toJSON(e.data)}let i={},r=!1;for(let a in this.morphAttributes){let c=this.morphAttributes[a],l=[];for(let u=0,d=c.length;u<d;u++){let h=c[u];l.push(h.toJSON(e.data))}if(l.length>0)i[a]=l,r=!0}if(r)e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative;let s=this.groups;if(s.length>0)e.data.groups=JSON.parse(JSON.stringify(s));let o=this.boundingSphere;if(o!==null)e.data.boundingSphere=o.toJSON();return e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;if(n!==null)this.setIndex(n.clone());let i=e.attributes;for(let c in i){let l=i[c];this.setAttribute(c,l.clone(t))}let r=e.morphAttributes;for(let c in r){let l=[],u=r[c];for(let d=0,h=u.length;d<h;d++)l.push(u[d].clone(t));this.morphAttributes[c]=l}this.morphTargetsRelative=e.morphTargetsRelative;let s=e.groups;for(let c=0,l=s.length;c<l;c++){let u=s[c];this.addGroup(u.start,u.count,u.materialIndex)}let o=e.boundingBox;if(o!==null)this.boundingBox=o.clone();let a=e.boundingSphere;if(a!==null)this.boundingSphere=a.clone();return this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Gr{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=35044,this.updateRanges=[],this.version=0,this.uuid=Mn()}onUploadCallback(){}set needsUpdate(e){if(e===!0)this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let i=0,r=this.stride;i<r;i++)this.array[e+i]=t.array[n+i];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){if(e.arrayBuffers===void 0)e.arrayBuffers={};if(this.array.buffer._uuid===void 0)this.array.buffer._uuid=Mn();if(e.arrayBuffers[this.array.buffer._uuid]===void 0)e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer;let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){if(e.arrayBuffers===void 0)e.arrayBuffers={};if(this.array.buffer._uuid===void 0)this.array.buffer._uuid=Mn();if(e.arrayBuffers[this.array.buffer._uuid]===void 0)e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer));let t={uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride};return t.usage=this.usage,t}}var qt=new U;class Si{constructor(e,t,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)qt.fromBufferAttribute(this,t),qt.applyMatrix4(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)qt.fromBufferAttribute(this,t),qt.applyNormalMatrix(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)qt.fromBufferAttribute(this,t),qt.transformDirection(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];if(this.normalized)n=bn(n,this.array);return n}setComponent(e,t,n){if(this.normalized)n=st(n,this.array);return this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){if(this.normalized)t=st(t,this.array);return this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){if(this.normalized)t=st(t,this.array);return this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){if(this.normalized)t=st(t,this.array);return this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){if(this.normalized)t=st(t,this.array);return this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];if(this.normalized)t=bn(t,this.array);return t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];if(this.normalized)t=bn(t,this.array);return t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];if(this.normalized)t=bn(t,this.array);return t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];if(this.normalized)t=bn(t,this.array);return t}setXY(e,t,n){if(e=e*this.data.stride+this.offset,this.normalized)t=st(t,this.array),n=st(n,this.array);return this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,i){if(e=e*this.data.stride+this.offset,this.normalized)t=st(t,this.array),n=st(n,this.array),i=st(i,this.array);return this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this}setXYZW(e,t,n,i,r){if(e=e*this.data.stride+this.offset,this.normalized)t=st(t,this.array),n=st(n,this.array),i=st(i,this.array),r=st(r,this.array);return this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this.data.array[e+3]=r,this}clone(e){if(e===void 0){vs("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return new Ft(new this.array.constructor(t),this.itemSize,this.normalized)}else{if(e.interleavedBuffers===void 0)e.interleavedBuffers={};if(e.interleavedBuffers[this.data.uuid]===void 0)e.interleavedBuffers[this.data.uuid]=this.data.clone(e);return new Si(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}}toJSON(e){if(e===void 0){vs("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else{if(e.interleavedBuffers===void 0)e.interleavedBuffers={};if(e.interleavedBuffers[this.data.uuid]===void 0)e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e);return{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}}var Mc=new U,kx=new U,Bx=new Fe;class pn{constructor(e=new U(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let i=Mc.subVectors(n,t).cross(kx.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){let i=e.delta(Mc),r=this.normal.dot(i);if(r===0){if(this.distanceToPoint(e.start)===0)return t.copy(e.start);return null}let s=-(e.start.dot(this.normal)+this.constant)/r;if(n===!0&&(s<0||s>1))return null;return t.copy(e.start).addScaledVector(i,s)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||Bx.getNormalMatrix(e),i=this.coplanarPoint(Mc).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}}var Gx=0;class Qt extends kn{constructor(){super();this.isMaterial=!0,Object.defineProperty(this,"id",{value:Gx++}),this.uuid=Mn(),this.name="",this.type="Material",this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Re(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=7680,this.stencilZFail=7680,this.stencilZPass=7680,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){if(this._alphaTest>0!==e>0)this.version++;this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e===void 0)return;for(let t in e){let n=e[t];if(n===void 0){Te(`Material: parameter '${t}' has value of undefined.`);continue}let i=this[t];if(i===void 0){Te(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}if(i&&i.isColor)i.set(n);else if(i&&i.isVector2&&(n&&n.isVector2)||i&&i.isEuler&&(n&&n.isEuler)||i&&i.isVector3&&(n&&n.isVector3))i.copy(n);else this[t]=n}}toJSON(e){let t=e===void 0||typeof e==="string";if(t)e={textures:{},images:{}};let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};if(n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor)n.color=this.color.getHex();if(this.roughness!==void 0)n.roughness=this.roughness;if(this.metalness!==void 0)n.metalness=this.metalness;if(this.sheen!==void 0)n.sheen=this.sheen;if(this.sheenColor&&this.sheenColor.isColor)n.sheenColor=this.sheenColor.getHex();if(this.sheenRoughness!==void 0)n.sheenRoughness=this.sheenRoughness;if(this.emissive&&this.emissive.isColor)n.emissive=this.emissive.getHex();if(this.emissiveIntensity!==void 0)n.emissiveIntensity=this.emissiveIntensity;if(this.specular&&this.specular.isColor)n.specular=this.specular.getHex();if(this.specularIntensity!==void 0)n.specularIntensity=this.specularIntensity;if(this.specularColor&&this.specularColor.isColor)n.specularColor=this.specularColor.getHex();if(this.shininess!==void 0)n.shininess=this.shininess;if(this.clearcoat!==void 0)n.clearcoat=this.clearcoat;if(this.clearcoatRoughness!==void 0)n.clearcoatRoughness=this.clearcoatRoughness;if(this.clearcoatMap&&this.clearcoatMap.isTexture)n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid;if(this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture)n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid;if(this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture)n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray();if(this.sheenColorMap&&this.sheenColorMap.isTexture)n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid;if(this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture)n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid;if(this.dispersion!==void 0)n.dispersion=this.dispersion;if(this.retroreflectivity!==void 0)n.retroreflectivity=this.retroreflectivity;if(this.iridescence!==void 0)n.iridescence=this.iridescence;if(this.iridescenceIOR!==void 0)n.iridescenceIOR=this.iridescenceIOR;if(this.iridescenceThicknessRange!==void 0)n.iridescenceThicknessRange=this.iridescenceThicknessRange;if(this.iridescenceMap&&this.iridescenceMap.isTexture)n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid;if(this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture)n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid;if(this.anisotropy!==void 0)n.anisotropy=this.anisotropy;if(this.anisotropyRotation!==void 0)n.anisotropyRotation=this.anisotropyRotation;if(this.anisotropyMap&&this.anisotropyMap.isTexture)n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid;if(this.map&&this.map.isTexture)n.map=this.map.toJSON(e).uuid;if(this.matcap&&this.matcap.isTexture)n.matcap=this.matcap.toJSON(e).uuid;if(this.alphaMap&&this.alphaMap.isTexture)n.alphaMap=this.alphaMap.toJSON(e).uuid;if(this.lightMap&&this.lightMap.isTexture)n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity;if(this.aoMap&&this.aoMap.isTexture)n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity;if(this.bumpMap&&this.bumpMap.isTexture)n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale;if(this.normalMap&&this.normalMap.isTexture)n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray();if(this.displacementMap&&this.displacementMap.isTexture)n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias;if(this.roughnessMap&&this.roughnessMap.isTexture)n.roughnessMap=this.roughnessMap.toJSON(e).uuid;if(this.metalnessMap&&this.metalnessMap.isTexture)n.metalnessMap=this.metalnessMap.toJSON(e).uuid;if(this.emissiveMap&&this.emissiveMap.isTexture)n.emissiveMap=this.emissiveMap.toJSON(e).uuid;if(this.specularMap&&this.specularMap.isTexture)n.specularMap=this.specularMap.toJSON(e).uuid;if(this.specularIntensityMap&&this.specularIntensityMap.isTexture)n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid;if(this.specularColorMap&&this.specularColorMap.isTexture)n.specularColorMap=this.specularColorMap.toJSON(e).uuid;if(this.envMap&&this.envMap.isTexture){if(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0)n.combine=this.combine}if(this.envMapRotation!==void 0)n.envMapRotation=this.envMapRotation.toArray();if(this.envMapIntensity!==void 0)n.envMapIntensity=this.envMapIntensity;if(this.reflectivity!==void 0)n.reflectivity=this.reflectivity;if(this.refractionRatio!==void 0)n.refractionRatio=this.refractionRatio;if(this.gradientMap&&this.gradientMap.isTexture)n.gradientMap=this.gradientMap.toJSON(e).uuid;if(this.transmission!==void 0)n.transmission=this.transmission;if(this.transmissionMap&&this.transmissionMap.isTexture)n.transmissionMap=this.transmissionMap.toJSON(e).uuid;if(this.thickness!==void 0)n.thickness=this.thickness;if(this.thicknessMap&&this.thicknessMap.isTexture)n.thicknessMap=this.thicknessMap.toJSON(e).uuid;if(this.attenuationDistance!==void 0)n.attenuationDistance=this.attenuationDistance;if(this.attenuationColor!==void 0)n.attenuationColor=this.attenuationColor.getHex();if(this.size!==void 0)n.size=this.size;if(this.sizeAttenuation!==void 0)n.sizeAttenuation=this.sizeAttenuation;if(Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0)n.clippingPlanes=this.clippingPlanes.map((r)=>r.toJSON());if(this.rotation!==void 0)n.rotation=this.rotation;if(this.depthPacking!==void 0)n.depthPacking=this.depthPacking;if(this.linewidth!==void 0)n.linewidth=this.linewidth;if(this.linecap!==void 0)n.linecap=this.linecap;if(this.linejoin!==void 0)n.linejoin=this.linejoin;if(this.dashSize!==void 0)n.dashSize=this.dashSize;if(this.gapSize!==void 0)n.gapSize=this.gapSize;if(this.scale!==void 0)n.scale=this.scale;if(this.wireframe!==void 0)n.wireframe=this.wireframe;if(this.wireframeLinewidth!==void 0)n.wireframeLinewidth=this.wireframeLinewidth;if(this.wireframeLinecap!==void 0)n.wireframeLinecap=this.wireframeLinecap;if(this.wireframeLinejoin!==void 0)n.wireframeLinejoin=this.wireframeLinejoin;if(this.flatShading!==void 0)n.flatShading=this.flatShading;if(this.fog!==void 0)n.fog=this.fog;if(Object.keys(this.userData).length>0)n.userData=this.userData;function i(r){let s=[];for(let o in r){let a=r[o];delete a.metadata,s.push(a)}return s}if(t){let r=i(e.textures),s=i(e.images);if(r.length>0)n.textures=r;if(s.length>0)n.images=s}return n}fromJSON(e,t){if(e.uuid!==void 0)this.uuid=e.uuid;if(e.name!==void 0)this.name=e.name;if(e.color!==void 0&&this.color!==void 0)this.color.setHex(e.color);if(e.roughness!==void 0)this.roughness=e.roughness;if(e.metalness!==void 0)this.metalness=e.metalness;if(e.sheen!==void 0)this.sheen=e.sheen;if(e.sheenColor!==void 0)this.sheenColor=new Re().setHex(e.sheenColor);if(e.sheenRoughness!==void 0)this.sheenRoughness=e.sheenRoughness;if(e.emissive!==void 0&&this.emissive!==void 0)this.emissive.setHex(e.emissive);if(e.specular!==void 0&&this.specular!==void 0)this.specular.setHex(e.specular);if(e.specularIntensity!==void 0)this.specularIntensity=e.specularIntensity;if(e.specularColor!==void 0&&this.specularColor!==void 0)this.specularColor.setHex(e.specularColor);if(e.shininess!==void 0)this.shininess=e.shininess;if(e.clearcoat!==void 0)this.clearcoat=e.clearcoat;if(e.clearcoatRoughness!==void 0)this.clearcoatRoughness=e.clearcoatRoughness;if(e.dispersion!==void 0)this.dispersion=e.dispersion;if(e.retroreflectivity!==void 0)this.retroreflectivity=e.retroreflectivity;if(e.iridescence!==void 0)this.iridescence=e.iridescence;if(e.iridescenceIOR!==void 0)this.iridescenceIOR=e.iridescenceIOR;if(e.iridescenceThicknessRange!==void 0)this.iridescenceThicknessRange=e.iridescenceThicknessRange;if(e.transmission!==void 0)this.transmission=e.transmission;if(e.thickness!==void 0)this.thickness=e.thickness;if(e.attenuationDistance!==void 0)this.attenuationDistance=e.attenuationDistance;if(e.attenuationColor!==void 0&&this.attenuationColor!==void 0)this.attenuationColor.setHex(e.attenuationColor);if(e.anisotropy!==void 0)this.anisotropy=e.anisotropy;if(e.anisotropyRotation!==void 0)this.anisotropyRotation=e.anisotropyRotation;if(e.fog!==void 0)this.fog=e.fog;if(e.flatShading!==void 0)this.flatShading=e.flatShading;if(e.blending!==void 0)this.blending=e.blending;if(e.combine!==void 0)this.combine=e.combine;if(e.side!==void 0)this.side=e.side;if(e.shadowSide!==void 0)this.shadowSide=e.shadowSide;if(e.opacity!==void 0)this.opacity=e.opacity;if(e.transparent!==void 0)this.transparent=e.transparent;if(e.alphaTest!==void 0)this.alphaTest=e.alphaTest;if(e.alphaHash!==void 0)this.alphaHash=e.alphaHash;if(e.depthFunc!==void 0)this.depthFunc=e.depthFunc;if(e.depthTest!==void 0)this.depthTest=e.depthTest;if(e.depthWrite!==void 0)this.depthWrite=e.depthWrite;if(e.colorWrite!==void 0)this.colorWrite=e.colorWrite;if(e.clippingPlanes!==void 0)this.clippingPlanes=e.clippingPlanes.map((n)=>new pn().fromJSON(n));if(e.clipIntersection!==void 0)this.clipIntersection=e.clipIntersection;if(e.clipShadows!==void 0)this.clipShadows=e.clipShadows;if(e.depthPacking!==void 0)this.depthPacking=e.depthPacking;if(e.blendSrc!==void 0)this.blendSrc=e.blendSrc;if(e.blendDst!==void 0)this.blendDst=e.blendDst;if(e.blendEquation!==void 0)this.blendEquation=e.blendEquation;if(e.blendSrcAlpha!==void 0)this.blendSrcAlpha=e.blendSrcAlpha;if(e.blendDstAlpha!==void 0)this.blendDstAlpha=e.blendDstAlpha;if(e.blendEquationAlpha!==void 0)this.blendEquationAlpha=e.blendEquationAlpha;if(e.blendColor!==void 0&&this.blendColor!==void 0)this.blendColor.setHex(e.blendColor);if(e.blendAlpha!==void 0)this.blendAlpha=e.blendAlpha;if(e.stencilWriteMask!==void 0)this.stencilWriteMask=e.stencilWriteMask;if(e.stencilFunc!==void 0)this.stencilFunc=e.stencilFunc;if(e.stencilRef!==void 0)this.stencilRef=e.stencilRef;if(e.stencilFuncMask!==void 0)this.stencilFuncMask=e.stencilFuncMask;if(e.stencilFail!==void 0)this.stencilFail=e.stencilFail;if(e.stencilZFail!==void 0)this.stencilZFail=e.stencilZFail;if(e.stencilZPass!==void 0)this.stencilZPass=e.stencilZPass;if(e.stencilWrite!==void 0)this.stencilWrite=e.stencilWrite;if(e.wireframe!==void 0)this.wireframe=e.wireframe;if(e.wireframeLinewidth!==void 0)this.wireframeLinewidth=e.wireframeLinewidth;if(e.wireframeLinecap!==void 0)this.wireframeLinecap=e.wireframeLinecap;if(e.wireframeLinejoin!==void 0)this.wireframeLinejoin=e.wireframeLinejoin;if(e.rotation!==void 0)this.rotation=e.rotation;if(e.linewidth!==void 0)this.linewidth=e.linewidth;if(e.linecap!==void 0)this.linecap=e.linecap;if(e.linejoin!==void 0)this.linejoin=e.linejoin;if(e.dashSize!==void 0)this.dashSize=e.dashSize;if(e.gapSize!==void 0)this.gapSize=e.gapSize;if(e.scale!==void 0)this.scale=e.scale;if(e.polygonOffset!==void 0)this.polygonOffset=e.polygonOffset;if(e.polygonOffsetFactor!==void 0)this.polygonOffsetFactor=e.polygonOffsetFactor;if(e.polygonOffsetUnits!==void 0)this.polygonOffsetUnits=e.polygonOffsetUnits;if(e.dithering!==void 0)this.dithering=e.dithering;if(e.alphaToCoverage!==void 0)this.alphaToCoverage=e.alphaToCoverage;if(e.premultipliedAlpha!==void 0)this.premultipliedAlpha=e.premultipliedAlpha;if(e.forceSinglePass!==void 0)this.forceSinglePass=e.forceSinglePass;if(e.allowOverride!==void 0)this.allowOverride=e.allowOverride;if(e.visible!==void 0)this.visible=e.visible;if(e.toneMapped!==void 0)this.toneMapped=e.toneMapped;if(e.userData!==void 0)this.userData=e.userData;if(e.vertexColors!==void 0)if(typeof e.vertexColors==="number")this.vertexColors=e.vertexColors>0;else this.vertexColors=e.vertexColors;if(e.size!==void 0)this.size=e.size;if(e.sizeAttenuation!==void 0)this.sizeAttenuation=e.sizeAttenuation;if(e.map!==void 0)this.map=t[e.map]||null;if(e.matcap!==void 0)this.matcap=t[e.matcap]||null;if(e.alphaMap!==void 0)this.alphaMap=t[e.alphaMap]||null;if(e.bumpMap!==void 0)this.bumpMap=t[e.bumpMap]||null;if(e.bumpScale!==void 0)this.bumpScale=e.bumpScale;if(e.normalMap!==void 0)this.normalMap=t[e.normalMap]||null;if(e.normalMapType!==void 0)this.normalMapType=e.normalMapType;if(e.normalScale!==void 0){let n=e.normalScale;if(Array.isArray(n)===!1)n=[n,n];this.normalScale=new Ue().fromArray(n)}if(e.displacementMap!==void 0)this.displacementMap=t[e.displacementMap]||null;if(e.displacementScale!==void 0)this.displacementScale=e.displacementScale;if(e.displacementBias!==void 0)this.displacementBias=e.displacementBias;if(e.roughnessMap!==void 0)this.roughnessMap=t[e.roughnessMap]||null;if(e.metalnessMap!==void 0)this.metalnessMap=t[e.metalnessMap]||null;if(e.emissiveMap!==void 0)this.emissiveMap=t[e.emissiveMap]||null;if(e.emissiveIntensity!==void 0)this.emissiveIntensity=e.emissiveIntensity;if(e.specularMap!==void 0)this.specularMap=t[e.specularMap]||null;if(e.specularIntensityMap!==void 0)this.specularIntensityMap=t[e.specularIntensityMap]||null;if(e.specularColorMap!==void 0)this.specularColorMap=t[e.specularColorMap]||null;if(e.envMap!==void 0)this.envMap=t[e.envMap]||null;if(e.envMapRotation!==void 0)this.envMapRotation.fromArray(e.envMapRotation);if(e.envMapIntensity!==void 0)this.envMapIntensity=e.envMapIntensity;if(e.reflectivity!==void 0)this.reflectivity=e.reflectivity;if(e.refractionRatio!==void 0)this.refractionRatio=e.refractionRatio;if(e.lightMap!==void 0)this.lightMap=t[e.lightMap]||null;if(e.lightMapIntensity!==void 0)this.lightMapIntensity=e.lightMapIntensity;if(e.aoMap!==void 0)this.aoMap=t[e.aoMap]||null;if(e.aoMapIntensity!==void 0)this.aoMapIntensity=e.aoMapIntensity;if(e.gradientMap!==void 0)this.gradientMap=t[e.gradientMap]||null;if(e.clearcoatMap!==void 0)this.clearcoatMap=t[e.clearcoatMap]||null;if(e.clearcoatRoughnessMap!==void 0)this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null;if(e.clearcoatNormalMap!==void 0)this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null;if(e.clearcoatNormalScale!==void 0)this.clearcoatNormalScale=new Ue().fromArray(e.clearcoatNormalScale);if(e.iridescenceMap!==void 0)this.iridescenceMap=t[e.iridescenceMap]||null;if(e.iridescenceThicknessMap!==void 0)this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null;if(e.transmissionMap!==void 0)this.transmissionMap=t[e.transmissionMap]||null;if(e.thicknessMap!==void 0)this.thicknessMap=t[e.thicknessMap]||null;if(e.anisotropyMap!==void 0)this.anisotropyMap=t[e.anisotropyMap]||null;if(e.sheenColorMap!==void 0)this.sheenColorMap=t[e.sheenColorMap]||null;if(e.sheenRoughnessMap!==void 0)this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null;return this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let i=t.length;n=Array(i);for(let r=0;r!==i;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){if(e===!0)this.version++}}class kl extends Qt{constructor(e){super();this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new Re(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}var br,us=new U,Mr=new U,wr=new U,Tr=new Ue,hs=new Ue,ug=new Oe,wo=new U,ds=new U,To=new U,Fp=new Ue,wc=new Ue,zp=new Ue;class ua extends lt{constructor(e=new kl){super();if(this.isSprite=!0,this.type="Sprite",br===void 0){br=new Mt;let t=new Float32Array([-0.5,-0.5,0,0,0,0.5,-0.5,0,1,0,0.5,0.5,0,1,1,-0.5,0.5,0,0,1]),n=new Gr(t,5);br.setIndex([0,1,2,0,2,3]),br.setAttribute("position",new Si(n,3,0,!1)),br.setAttribute("uv",new Si(n,2,3,!1))}this.geometry=br,this.material=e,this.center=new Ue(0.5,0.5),this.count=1}intersectsFrustum(e){return e.intersectsSprite(this)}raycast(e,t){if(e.camera===null)Ne('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.');if(Mr.setFromMatrixScale(this.matrixWorld),ug.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),wr.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1)Mr.multiplyScalar(-wr.z);let n=this.material.rotation,i,r;if(n!==0)r=Math.cos(n),i=Math.sin(n);let s=this.center;Eo(wo.set(-0.5,-0.5,0),wr,s,Mr,i,r),Eo(ds.set(0.5,-0.5,0),wr,s,Mr,i,r),Eo(To.set(0.5,0.5,0),wr,s,Mr,i,r),Fp.set(0,0),wc.set(1,0),zp.set(1,1);let o=e.ray.intersectTriangle(wo,ds,To,!1,us);if(o===null){if(Eo(ds.set(-0.5,0.5,0),wr,s,Mr,i,r),wc.set(0,1),o=e.ray.intersectTriangle(wo,To,ds,!1,us),o===null)return}let a=e.ray.origin.distanceTo(us);if(a<e.near||a>e.far)return;t.push({distance:a,point:us.clone(),uv:sn.getInterpolation(us,wo,ds,To,Fp,wc,zp,new Ue),face:null,object:this})}copy(e,t){if(super.copy(e,t),e.center!==void 0)this.center.copy(e.center);return this.material=e.material,this}}function Eo(e,t,n,i,r,s){if(Tr.subVectors(e,n).addScalar(0.5).multiply(i),r!==void 0)hs.x=s*Tr.x-r*Tr.y,hs.y=r*Tr.x+s*Tr.y;else hs.copy(Tr);e.copy(t),e.x+=hs.x,e.y+=hs.y,e.applyMatrix4(ug)}var ei=new U,Tc=new U,Ao=new U,Ro=new U;class ji{constructor(e=new U,t=new U(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,ei)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);if(n<0)return t.copy(this.origin);return t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=ei.subVectors(e,this.origin).dot(this.direction);if(t<0)return this.origin.distanceToSquared(e);return ei.copy(this.origin).addScaledVector(this.direction,t),ei.distanceToSquared(e)}distanceSqToSegment(e,t,n,i){Tc.copy(e).add(t).multiplyScalar(0.5),Ao.copy(t).sub(e).normalize(),Ro.copy(this.origin).sub(Tc);let r=e.distanceTo(t)*0.5,s=-this.direction.dot(Ao),o=Ro.dot(this.direction),a=-Ro.dot(Ao),c=Ro.lengthSq(),l=Math.abs(1-s*s),u,d,h,f;if(l>0)if(u=s*a-o,d=s*o-a,f=r*l,u>=0)if(d>=-f)if(d<=f){let g=1/l;u*=g,d*=g,h=u*(u+s*d+2*o)+d*(s*u+d+2*a)+c}else d=r,u=Math.max(0,-(s*d+o)),h=-u*u+d*(d+2*a)+c;else d=-r,u=Math.max(0,-(s*d+o)),h=-u*u+d*(d+2*a)+c;else if(d<=-f)u=Math.max(0,-(-s*r+o)),d=u>0?-r:Math.min(Math.max(-r,-a),r),h=-u*u+d*(d+2*a)+c;else if(d<=f)u=0,d=Math.min(Math.max(-r,-a),r),h=d*(d+2*a)+c;else u=Math.max(0,-(s*r+o)),d=u>0?r:Math.min(Math.max(-r,-a),r),h=-u*u+d*(d+2*a)+c;else d=s>0?-r:r,u=Math.max(0,-(s*d+o)),h=-u*u+d*(d+2*a)+c;if(n)n.copy(this.origin).addScaledVector(this.direction,u);if(i)i.copy(Tc).addScaledVector(Ao,d);return h}intersectSphere(e,t){if(e.radius<0)return null;ei.subVectors(e.center,this.origin);let n=ei.dot(this.direction),i=ei.dot(ei)-n*n,r=e.radius*e.radius;if(i>r)return null;let s=Math.sqrt(r-i),o=n-s,a=n+s;if(a<0)return null;if(o<0)return this.at(a,t);return this.at(o,t)}intersectsSphere(e){if(e.radius<0)return!1;return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0){if(e.distanceToPoint(this.origin)===0)return 0;return null}let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);if(n===null)return null;return this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);if(t===0)return!0;if(e.normal.dot(this.direction)*t<0)return!0;return!1}intersectBox(e,t){let n,i,r,s,o,a,c=1/this.direction.x,l=1/this.direction.y,u=1/this.direction.z,d=this.origin;if(c>=0)n=(e.min.x-d.x)*c,i=(e.max.x-d.x)*c;else n=(e.max.x-d.x)*c,i=(e.min.x-d.x)*c;if(l>=0)r=(e.min.y-d.y)*l,s=(e.max.y-d.y)*l;else r=(e.max.y-d.y)*l,s=(e.min.y-d.y)*l;if(n>s||r>i)return null;if(r>n||isNaN(n))n=r;if(s<i||isNaN(i))i=s;if(u>=0)o=(e.min.z-d.z)*u,a=(e.max.z-d.z)*u;else o=(e.max.z-d.z)*u,a=(e.min.z-d.z)*u;if(n>a||o>i)return null;if(o>n||n!==n)n=o;if(a<i||i!==i)i=a;if(i<0)return null;return this.at(n>=0?n:i,t)}intersectsBox(e){return this.intersectBox(e,ei)!==null}intersectTriangle(e,t,n,i,r){let s=this.origin,o=this.direction,{x:a,y:c,z:l}=o,u=e.x-s.x,d=e.y-s.y,h=e.z-s.z,f=t.x-s.x,g=t.y-s.y,S=t.z-s.z,p=n.x-s.x,m=n.y-s.y,T=n.z-s.z,A=Math.abs(a),v=Math.abs(c),w=Math.abs(l),E,R,x,M,H,O,z,D,C,F,Z,G;if(A>=v&&A>=w)if(x=a,O=u,C=f,G=p,a>=0)E=c,R=l,M=d,H=h,z=g,D=S,F=m,Z=T;else E=l,R=c,M=h,H=d,z=S,D=g,F=T,Z=m;else if(v>=w)if(x=c,O=d,C=g,G=m,c>=0)E=l,R=a,M=h,H=u,z=S,D=f,F=T,Z=p;else E=a,R=l,M=u,H=h,z=f,D=S,F=p,Z=T;else if(x=l,O=h,C=S,G=T,l>=0)E=a,R=c,M=u,H=d,z=f,D=g,F=p,Z=m;else E=c,R=a,M=d,H=u,z=g,D=f,F=m,Z=p;if(x===0)return null;let ie=E/x,X=R/x,Q=1/x,ee=M-ie*O,ve=H-X*O,Ee=z-ie*C,qe=D-X*C,ke=F-ie*G,q=Z-X*G,re=ke*qe-q*Ee,se=ee*q-ve*ke,Pe=Ee*ve-qe*ee;if(i){if(re<0||se<0||Pe<0)return null}else if((re<0||se<0||Pe<0)&&(re>0||se>0||Pe>0))return null;let De=re+se+Pe;if(De===0)return null;let Ce=Q*(re*O+se*C+Pe*G);if(De>0?Ce<0:Ce>0)return null;return this.at(Ce/De,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Bn extends Qt{constructor(e){super();this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Re(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ii,this.combine=0,this.reflectivity=1,this.refractionRatio=0.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}var kp=new Oe,Hi=new ji,Co=new cn,Bp=new U,Io=new U,Po=new U,Lo=new U,Ec=new U,No=new U,Gp=new U,Do=new U;class xt extends lt{constructor(e=new Mt,t=new Bn){super();this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){if(super.copy(e,t),e.morphTargetInfluences!==void 0)this.morphTargetInfluences=e.morphTargetInfluences.slice();if(e.morphTargetDictionary!==void 0)this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary);return this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,s=i.length;r<s;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(e,t){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,s=n.morphTargetsRelative;t.fromBufferAttribute(i,e);let o=this.morphTargetInfluences;if(r&&o){No.set(0,0,0);for(let a=0,c=r.length;a<c;a++){let l=o[a],u=r[a];if(l===0)continue;if(Ec.fromBufferAttribute(u,e),s)No.addScaledVector(Ec,l);else No.addScaledVector(Ec.sub(t),l)}t.add(No)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,i=this.material,r=this.matrixWorld;if(i===void 0)return;if(n.boundingSphere===null)n.computeBoundingSphere();if(Co.copy(n.boundingSphere),Co.applyMatrix4(r),Hi.copy(e.ray).recast(e.near),Co.containsPoint(Hi.origin)===!1){if(Hi.intersectSphere(Co,Bp)===null)return;if(Hi.origin.distanceToSquared(Bp)>(e.far-e.near)**2)return}if(kp.copy(r).invert(),Hi.copy(e.ray).applyMatrix4(kp),n.boundingBox!==null){if(Hi.intersectsBox(n.boundingBox)===!1)return}this._computeIntersections(e,t,Hi)}_computeIntersections(e,t,n){let i,r=this.geometry,s=this.material,o=r.index,a=r.attributes.position,c=r.attributes.uv,l=r.attributes.uv1,u=r.attributes.normal,{groups:d,drawRange:h}=r;if(o!==null)if(Array.isArray(s))for(let f=0,g=d.length;f<g;f++){let S=d[f],p=s[S.materialIndex],m=Math.max(S.start,h.start),T=Math.min(o.count,Math.min(S.start+S.count,h.start+h.count));for(let A=m,v=T;A<v;A+=3){let w=o.getX(A),E=o.getX(A+1),R=o.getX(A+2);if(i=Uo(this,p,e,n,c,l,u,w,E,R),i)i.faceIndex=Math.floor(A/3),i.face.materialIndex=S.materialIndex,t.push(i)}}else{let f=Math.max(0,h.start),g=Math.min(o.count,h.start+h.count);for(let S=f,p=g;S<p;S+=3){let m=o.getX(S),T=o.getX(S+1),A=o.getX(S+2);if(i=Uo(this,s,e,n,c,l,u,m,T,A),i)i.faceIndex=Math.floor(S/3),t.push(i)}}else if(a!==void 0)if(Array.isArray(s))for(let f=0,g=d.length;f<g;f++){let S=d[f],p=s[S.materialIndex],m=Math.max(S.start,h.start),T=Math.min(a.count,Math.min(S.start+S.count,h.start+h.count));for(let A=m,v=T;A<v;A+=3){let w=A,E=A+1,R=A+2;if(i=Uo(this,p,e,n,c,l,u,w,E,R),i)i.faceIndex=Math.floor(A/3),i.face.materialIndex=S.materialIndex,t.push(i)}}else{let f=Math.max(0,h.start),g=Math.min(a.count,h.start+h.count);for(let S=f,p=g;S<p;S+=3){let m=S,T=S+1,A=S+2;if(i=Uo(this,s,e,n,c,l,u,m,T,A),i)i.faceIndex=Math.floor(S/3),t.push(i)}}}}function Hx(e,t,n,i,r,s,o,a){let c;if(t.side===1)c=i.intersectTriangle(o,s,r,!0,a);else c=i.intersectTriangle(r,s,o,t.side===0,a);if(c===null)return null;Do.copy(a),Do.applyMatrix4(e.matrixWorld);let l=n.ray.origin.distanceTo(Do);if(l<n.near||l>n.far)return null;return{distance:l,point:Do.clone(),object:e}}function Uo(e,t,n,i,r,s,o,a,c,l){e.getVertexPosition(a,Io),e.getVertexPosition(c,Po),e.getVertexPosition(l,Lo);let u=Hx(e,t,n,i,Io,Po,Lo,Gp);if(u){let d=new U;if(sn.getBarycoord(Gp,Io,Po,Lo,d),r)u.uv=sn.getInterpolatedAttribute(r,a,c,l,d,new Ue);if(s)u.uv1=sn.getInterpolatedAttribute(s,a,c,l,d,new Ue);if(o){if(u.normal=sn.getInterpolatedAttribute(o,a,c,l,d,new U),u.normal.dot(i.direction)>0)u.normal.multiplyScalar(-1)}let h={a,b:c,c:l,normal:new U,materialIndex:0};sn.getNormal(Io,Po,Lo,h.normal),u.face=h,u.barycoord=d}return u}var fs=new ot,Hp=new ot,Vp=new ot,Vx=new ot,Wp=new Oe,Oo=new U,Ac=new cn,$p=new Oe,Rc=new ji;class Hr extends xt{constructor(e,t){super(e,t);this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode="attached",this.bindMatrix=new Oe,this.bindMatrixInverse=new Oe,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){let e=this.geometry;if(this.boundingBox===null)this.boundingBox=new _n;this.boundingBox.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,Oo),this.boundingBox.expandByPoint(Oo)}computeBoundingSphere(){let e=this.geometry;if(this.boundingSphere===null)this.boundingSphere=new cn;this.boundingSphere.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,Oo),this.boundingSphere.expandByPoint(Oo)}copy(e,t){if(super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,e.boundingBox!==null)this.boundingBox=e.boundingBox.clone();if(e.boundingSphere!==null)this.boundingSphere=e.boundingSphere.clone();return this}raycast(e,t){let n=this.material,i=this.matrixWorld;if(n===void 0)return;if(this.boundingSphere===null)this.computeBoundingSphere();if(Ac.copy(this.boundingSphere),Ac.applyMatrix4(i),e.ray.intersectsSphere(Ac)===!1)return;if($p.copy(i).invert(),Rc.copy(e.ray).applyMatrix4($p),this.boundingBox!==null){if(Rc.intersectsBox(this.boundingBox)===!1)return}this._computeIntersections(e,t,Rc)}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){if(this.skeleton=e,t===void 0)this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld;this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let e=new ot,t=this.geometry.attributes.skinWeight;for(let n=0,i=t.count;n<i;n++){e.fromBufferAttribute(t,n);let r=1/e.manhattanLength();if(r!==1/0)e.multiplyScalar(r);else e.set(1,0,0,0);t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){if(super.updateMatrixWorld(e),this.bindMode==="attached")this.bindMatrixInverse.copy(this.matrixWorld).invert();else if(this.bindMode==="detached")this.bindMatrixInverse.copy(this.bindMatrix).invert();else Te("SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(e,t){let n=this.skeleton,i=this.geometry;if(Hp.fromBufferAttribute(i.attributes.skinIndex,e),Vp.fromBufferAttribute(i.attributes.skinWeight,e),t.isVector4)fs.copy(t),t.set(0,0,0,0);else fs.set(...t,1),t.set(0,0,0);fs.applyMatrix4(this.bindMatrix);for(let r=0;r<4;r++){let s=Vp.getComponent(r);if(s!==0){let o=Hp.getComponent(r);Wp.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),t.addScaledVector(Vx.copy(fs).applyMatrix4(Wp),s)}}if(t.isVector4)t.w=fs.w;return t.applyMatrix4(this.bindMatrixInverse)}}class Cs extends lt{constructor(){super();this.isBone=!0,this.type="Bone"}}class Is extends _t{constructor(e=null,t=1,n=1,i,r,s,o,a,c=1003,l=1003,u,d){super(null,s,o,a,c,l,i,r,u,d);this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}var Zp=new Oe,Wx=new Oe;class Ps{constructor(e=[],t=[]){this.uuid=Mn(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){let e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(e.length*16),t.length===0)this.calculateInverses();else if(e.length!==t.length){Te("Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new Oe)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){let n=new Oe;if(this.bones[e])n.copy(this.bones[e].matrixWorld).invert();this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];if(n)n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];if(n){if(n.parent&&n.parent.isBone)n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld);else n.matrix.copy(n.matrixWorld);n.matrix.decompose(n.position,n.quaternion,n.scale)}}}update(){let e=this.bones,t=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,s=e.length;r<s;r++){let o=e[r]?e[r].matrixWorld:Wx;Zp.multiplyMatrices(o,t[r]),Zp.toArray(n,r*16)}if(i!==null)i.needsUpdate=!0}clone(){return new Ps(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(this.bones.length*4);e=Math.ceil(e/4)*4,e=Math.max(e,4);let t=new Float32Array(e*e*4);t.set(this.boneMatrices);let n=new Is(t,e,e,1023,1015);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){let i=this.bones[t];if(i.name===e)return i}return}dispose(){if(this.boneTexture!==null)this.boneTexture.dispose(),this.boneTexture=null}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,i=e.bones.length;n<i;n++){let r=e.bones[n],s=t[r];if(s===void 0)Te("Skeleton: No bone found with UUID:",r),s=new Cs;this.bones.push(s),this.boneInverses.push(new Oe().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){let e={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;let t=this.bones,n=this.boneInverses;for(let i=0,r=t.length;i<r;i++){let s=t[i];e.bones.push(s.uuid);let o=n[i];e.boneInverses.push(o.toArray())}return e}}class bi extends Ft{constructor(e,t,n,i=1){super(e,t,n);this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}var Er=new Oe,Xp=new Oe,Fo=[],qp=new _n,$x=new Oe,ps=new xt,ms=new cn;class ha extends xt{constructor(e,t,n){super(e,t);this.isInstancedMesh=!0,this.instanceMatrix=new bi(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,$x)}computeBoundingBox(){let e=this.geometry,t=this.count;if(this.boundingBox===null)this.boundingBox=new _n;if(e.boundingBox===null)e.computeBoundingBox();this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Er),qp.copy(e.boundingBox).applyMatrix4(Er),this.boundingBox.union(qp)}computeBoundingSphere(){let e=this.geometry,t=this.count;if(this.boundingSphere===null)this.boundingSphere=new cn;if(e.boundingSphere===null)e.computeBoundingSphere();this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Er),ms.copy(e.boundingSphere).applyMatrix4(Er),this.boundingSphere.union(ms)}copy(e,t){if(super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null)this.morphTexture=e.morphTexture.clone();if(e.instanceColor!==null)this.instanceColor=e.instanceColor.clone();if(this.count=e.count,e.boundingBox!==null)this.boundingBox=e.boundingBox.clone();if(e.boundingSphere!==null)this.boundingSphere=e.boundingSphere.clone();return this}getColorAt(e,t){if(this.instanceColor===null)return t.setRGB(1,1,1);else return t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let n=t.morphTargetInfluences,i=this.morphTexture.source.data.data,r=n.length+1,s=e*r+1;for(let o=0;o<n.length;o++)n[o]=i[s+o]}raycast(e,t){let n=this.matrixWorld,i=this.count;if(ps.geometry=this.geometry,ps.material=this.material,ps.material===void 0)return;if(this.boundingSphere===null)this.computeBoundingSphere();if(ms.copy(this.boundingSphere),ms.applyMatrix4(n),e.ray.intersectsSphere(ms)===!1)return;for(let r=0;r<i;r++){this.getMatrixAt(r,Er),Xp.multiplyMatrices(n,Er),ps.matrixWorld=Xp,ps.raycast(e,Fo);for(let s=0,o=Fo.length;s<o;s++){let a=Fo[s];a.instanceId=r,a.object=this,t.push(a)}Fo.length=0}}setColorAt(e,t){if(this.instanceColor===null)this.instanceColor=new bi(new Float32Array(this.instanceMatrix.count*3).fill(1),3);return t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){let n=t.morphTargetInfluences,i=n.length+1;if(this.morphTexture===null)this.morphTexture=new Is(new Float32Array(i*this.count),i,this.count,1028,1015);let r=this.morphTexture.source.data.data,s=0;for(let c=0;c<n.length;c++)s+=n[c];let o=this.geometry.morphTargetsRelative?1:1-s,a=i*e;return r[a]=o,r.set(n,a+1),this}updateMorphTargets(){}dispose(){if(super.dispose(),this.morphTexture!==null)this.morphTexture.dispose(),this.morphTexture=null}}var Vi=new cn,Zx=new Ue(0.5,0.5),zo=new U;class Ls{constructor(e=new pn,t=new pn,n=new pn,i=new pn,r=new pn,s=new pn){this.planes=[e,t,n,i,r,s]}set(e,t,n,i,r,s){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(i),o[4].copy(r),o[5].copy(s),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=2000,n=!1){let i=this.planes,r=e.elements,s=r[0],o=r[1],a=r[2],c=r[3],l=r[4],u=r[5],d=r[6],h=r[7],f=r[8],g=r[9],S=r[10],p=r[11],m=r[12],T=r[13],A=r[14],v=r[15];if(i[0].setComponents(c-s,h-l,p-f,v-m).normalize(),i[1].setComponents(c+s,h+l,p+f,v+m).normalize(),i[2].setComponents(c+o,h+u,p+g,v+T).normalize(),i[3].setComponents(c-o,h-u,p-g,v-T).normalize(),n)i[4].setComponents(a,d,S,A).normalize(),i[5].setComponents(c-a,h-d,p-S,v-A).normalize();else if(i[4].setComponents(c-a,h-d,p-S,v-A).normalize(),t===2000)i[5].setComponents(c+a,h+d,p+S,v+A).normalize();else if(t===2001)i[5].setComponents(a,d,S,A).normalize();else throw Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0){if(e.boundingSphere===null)e.computeBoundingSphere();Vi.copy(e.boundingSphere).applyMatrix4(e.matrixWorld)}else{let t=e.geometry;if(t.boundingSphere===null)t.computeBoundingSphere();Vi.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Vi)}intersectsSprite(e){Vi.center.set(0,0,0);let t=Zx.distanceTo(e.center);return Vi.radius=0.7071067811865476+t,Vi.applyMatrix4(e.matrixWorld),this.intersectsSphere(Vi)}intersectsSphere(e){let t=this.planes,n=e.center,i=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let i=t[n];if(zo.x=i.normal.x>0?e.max.x:e.min.x,zo.y=i.normal.y>0?e.max.y:e.min.y,zo.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(zo)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Ei extends Qt{constructor(e){super();this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Re(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}}var Zo=new U,Xo=new U,Yp=new Oe,gs=new ji,ko=new cn,Cc=new U,Jp=new U;class An extends lt{constructor(e=new Mt,t=new Ei){super();this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let i=1,r=t.count;i<r;i++)Zo.fromBufferAttribute(t,i-1),Xo.fromBufferAttribute(t,i),n[i]=n[i-1],n[i]+=Zo.distanceTo(Xo);e.setAttribute("lineDistance",new bt(n,1))}else Te("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Line.threshold,s=n.drawRange;if(n.boundingSphere===null)n.computeBoundingSphere();if(ko.copy(n.boundingSphere),ko.applyMatrix4(i),ko.radius+=r,e.ray.intersectsSphere(ko)===!1)return;Yp.copy(i).invert(),gs.copy(e.ray).applyMatrix4(Yp);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),a=o*o,c=this.isLineSegments?2:1,l=n.index,d=n.attributes.position;if(l!==null){let h=Math.max(0,s.start),f=Math.min(l.count,s.start+s.count);for(let g=h,S=f-1;g<S;g+=c){let p=l.getX(g),m=l.getX(g+1),T=Bo(this,e,gs,a,p,m,g);if(T)t.push(T)}if(this.isLineLoop){let g=l.getX(f-1),S=l.getX(h),p=Bo(this,e,gs,a,g,S,f-1);if(p)t.push(p)}}else{let h=Math.max(0,s.start),f=Math.min(d.count,s.start+s.count);for(let g=h,S=f-1;g<S;g+=c){let p=Bo(this,e,gs,a,g,g+1,g);if(p)t.push(p)}if(this.isLineLoop){let g=Bo(this,e,gs,a,f-1,h,f-1);if(g)t.push(g)}}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,s=i.length;r<s;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function Bo(e,t,n,i,r,s,o){let a=e.geometry.attributes.position;if(Zo.fromBufferAttribute(a,r),Xo.fromBufferAttribute(a,s),n.distanceSqToSegment(Zo,Xo,Cc,Jp)>i)return;Cc.applyMatrix4(e.matrixWorld);let l=t.ray.origin.distanceTo(Cc);if(l<t.near||l>t.far)return;return{distance:l,point:Jp.clone().applyMatrix4(e.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:e}}var Kp=new U,jp=new U;class Ns extends An{constructor(e,t){super(e,t);this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let i=0,r=t.count;i<r;i+=2)Kp.fromBufferAttribute(t,i),jp.fromBufferAttribute(t,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+Kp.distanceTo(jp);e.setAttribute("lineDistance",new bt(n,1))}else Te("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class da extends An{constructor(e,t){super(e,t);this.isLineLoop=!0,this.type="LineLoop"}}class Ds extends Qt{constructor(e){super();this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Re(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}var Qp=new Oe,Lc=new ji,Go=new cn,Ho=new U;class Ai extends lt{constructor(e=new Mt,t=new Ds){super();this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Points.threshold,s=n.drawRange;if(n.boundingSphere===null)n.computeBoundingSphere();if(Go.copy(n.boundingSphere),Go.applyMatrix4(i),Go.radius+=r,e.ray.intersectsSphere(Go)===!1)return;Qp.copy(i).invert(),Lc.copy(e.ray).applyMatrix4(Qp);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),a=o*o,c=n.index,u=n.attributes.position;if(c!==null){let d=Math.max(0,s.start),h=Math.min(c.count,s.start+s.count);for(let f=d,g=h;f<g;f++){let S=c.getX(f);Ho.fromBufferAttribute(u,S),em(Ho,S,a,i,e,t,this)}}else{let d=Math.max(0,s.start),h=Math.min(u.count,s.start+s.count);for(let f=d,g=h;f<g;f++)Ho.fromBufferAttribute(u,f),em(Ho,f,a,i,e,t,this)}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,s=i.length;r<s;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function em(e,t,n,i,r,s,o){let a=Lc.distanceSqToPoint(e);if(a<n){let c=new U;Lc.closestPointToPoint(e,c),c.applyMatrix4(i);let l=r.ray.origin.distanceTo(c);if(l<r.near||l>r.far)return;s.push({distance:l,distanceToRay:Math.sqrt(a),point:c,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}class fa extends _t{constructor(e=[],t=301,n,i,r,s,o,a,c,l){super(e,t,n,i,r,s,o,a,c,l);this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Qi extends _t{constructor(e,t,n=1014,i,r,s,o=1003,a=1003,c,l=1026,u=1){if(l!==1026&&l!==1027)throw Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let d={width:e,height:t,depth:u};super(d,i,r,s,o,a,l,n,c);this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Ts(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}}class Bl extends Qi{constructor(e,t=1014,n=301,i,r,s=1003,o=1003,a,c=1026){let l={width:e,height:e,depth:1},u=[l,l,l,l,l,l];super(e,e,t,n,i,r,s,o,a,c);this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class pa extends _t{constructor(e=null){super();this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class Ri extends Mt{constructor(e=1,t=1,n=1,i=1,r=1,s=1){super();this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:r,depthSegments:s};let o=this;i=Math.floor(i),r=Math.floor(r),s=Math.floor(s);let a=[],c=[],l=[],u=[],d=0,h=0;f("z","y","x",-1,-1,n,t,e,s,r,0),f("z","y","x",1,-1,n,t,-e,s,r,1),f("x","z","y",1,1,e,n,t,i,s,2),f("x","z","y",1,-1,e,n,-t,i,s,3),f("x","y","z",1,-1,e,t,n,i,r,4),f("x","y","z",-1,-1,e,t,-n,i,r,5),this.setIndex(a),this.setAttribute("position",new bt(c,3)),this.setAttribute("normal",new bt(l,3)),this.setAttribute("uv",new bt(u,2));function f(g,S,p,m,T,A,v,w,E,R,x){let M=A/E,H=v/R,O=A/2,z=v/2,D=w/2,C=E+1,F=R+1,Z=0,G=0,ie=new U;for(let X=0;X<F;X++){let Q=X*H-z;for(let ee=0;ee<C;ee++){let ve=ee*M-O;ie[g]=ve*m,ie[S]=Q*T,ie[p]=D,c.push(ie.x,ie.y,ie.z),ie[g]=0,ie[S]=0,ie[p]=w>0?1:-1,l.push(ie.x,ie.y,ie.z),u.push(ee/E),u.push(1-X/R),Z+=1}}for(let X=0;X<R;X++)for(let Q=0;Q<E;Q++){let ee=d+Q+C*X,ve=d+Q+C*(X+1),Ee=d+(Q+1)+C*(X+1),qe=d+(Q+1)+C*X;a.push(ee,ve,qe),a.push(ve,Ee,qe),G+=6}o.addGroup(h,G,x),h+=G,d+=Z}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Ri(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class er extends Mt{constructor(e=1,t=1,n=4,i=8,r=1){super();this.type="CapsuleGeometry",this.parameters={radius:e,height:t,capSegments:n,radialSegments:i,heightSegments:r},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),i=Math.max(3,Math.floor(i)),r=Math.max(1,Math.floor(r));let s=[],o=[],a=[],c=[],l=t/2,u=Math.PI/2*e,d=t,h=2*u+d,f=n*2+r,g=i+1,S=new U,p=new U;for(let m=0;m<=f;m++){let T=0,A=0,v=0,w=0;if(m<=n){let x=m/n,M=x*Math.PI/2;A=-l-e*Math.cos(M),v=e*Math.sin(M),w=-e*Math.cos(M),T=x*u}else if(m<=n+r){let x=(m-n)/r;A=-l+x*t,v=e,w=0,T=u+x*d}else{let x=(m-n-r)/n,M=x*Math.PI/2;A=l+e*Math.sin(M),v=e*Math.cos(M),w=e*Math.sin(M),T=u+d+x*u}let E=Math.max(0,Math.min(1,T/h)),R=0;if(m===0)R=0.5/i;else if(m===f)R=-0.5/i;for(let x=0;x<=i;x++){let M=x/i,H=M*Math.PI*2,O=Math.sin(H),z=Math.cos(H);p.x=-v*z,p.y=A,p.z=v*O,o.push(p.x,p.y,p.z),S.set(-v*z,w,v*O),S.normalize(),a.push(S.x,S.y,S.z),c.push(M+R,E)}if(m>0){let x=(m-1)*g;for(let M=0;M<i;M++){let H=x+M,O=x+M+1,z=m*g+M,D=m*g+M+1;s.push(H,O,z),s.push(O,D,z)}}}this.setIndex(s),this.setAttribute("position",new bt(o,3)),this.setAttribute("normal",new bt(a,3)),this.setAttribute("uv",new bt(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new er(e.radius,e.height,e.capSegments,e.radialSegments,e.heightSegments)}}class Us extends Mt{constructor(e=1,t=1,n=1,i=1){super();this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};let r=e/2,s=t/2,o=Math.floor(n),a=Math.floor(i),c=o+1,l=a+1,u=e/o,d=t/a,h=[],f=[],g=[],S=[];for(let p=0;p<l;p++){let m=p*d-s;for(let T=0;T<c;T++){let A=T*u-r;f.push(A,-m,0),g.push(0,0,1),S.push(T/o),S.push(1-p/a)}}for(let p=0;p<a;p++)for(let m=0;m<o;m++){let T=m+c*p,A=m+c*(p+1),v=m+1+c*(p+1),w=m+1+c*p;h.push(T,A,w),h.push(A,v,w)}this.setIndex(h),this.setAttribute("position",new bt(f,3)),this.setAttribute("normal",new bt(g,3)),this.setAttribute("uv",new bt(S,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Us(e.width,e.height,e.widthSegments,e.heightSegments)}}class Os extends Mt{constructor(e=1,t=32,n=16,i=0,r=Math.PI*2,s=0,o=Math.PI){super();this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:i,phiLength:r,thetaStart:s,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let a=Math.min(s+o,Math.PI),c=0,l=[],u=new U,d=new U,h=[],f=[],g=[],S=[];for(let p=0;p<=n;p++){let m=[],T=p/n,A=s+T*o,v=e*Math.cos(A),w=Math.sqrt(e*e-v*v),E=0;if(p===0&&s===0)E=0.5/t;else if(p===n&&a===Math.PI)E=-0.5/t;for(let R=0;R<=t;R++){let x=R/t,M=i+x*r;u.x=-w*Math.cos(M),u.y=v,u.z=w*Math.sin(M),f.push(u.x,u.y,u.z),d.copy(u).normalize(),g.push(d.x,d.y,d.z),S.push(x+E,1-T),m.push(c++)}l.push(m)}for(let p=0;p<n;p++)for(let m=0;m<t;m++){let T=l[p][m+1],A=l[p][m],v=l[p+1][m],w=l[p+1][m+1];if(p!==0||s>0)h.push(T,A,w);if(p!==n-1||a<Math.PI)h.push(A,v,w)}this.setIndex(h),this.setAttribute("position",new bt(f,3)),this.setAttribute("normal",new bt(g,3)),this.setAttribute("uv",new bt(S,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Os(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}function tr(e){let t={};for(let n in e){t[n]={};for(let i in e[n]){let r=e[n][i];if(tm(r))if(r.isRenderTargetTexture)Te("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[n][i]=null;else t[n][i]=r.clone();else if(Array.isArray(r))if(tm(r[0])){let s=[];for(let o=0,a=r.length;o<a;o++)s[o]=r[o].clone();t[n][i]=s}else t[n][i]=r.slice();else t[n][i]=r}}return t}function $t(e){let t={};for(let n=0;n<e.length;n++){let i=tr(e[n]);for(let r in i)t[r]=i[r]}return t}function tm(e){return e&&(e.isColor||e.isMatrix3||e.isMatrix4||e.isVector2||e.isVector3||e.isVector4||e.isTexture||e.isQuaternion)}function Xx(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function Gl(e){let t=e.getRenderTarget();if(t===null)return e.outputColorSpace;if(t.isXRRenderTarget===!0)return t.texture.colorSpace;return He.workingColorSpace}var hg={clone:tr,merge:$t},qx=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Yx=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class en extends Qt{constructor(e){super();if(this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=qx,this.fragmentShader=Yx,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0)this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=tr(e.uniforms),this.uniformsGroups=Xx(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let i in this.uniforms){let s=this.uniforms[i].value;if(s&&s.isTexture)t.uniforms[i]={type:"t",value:s.toJSON(e).uuid};else if(s&&s.isColor)t.uniforms[i]={type:"c",value:s.getHex()};else if(s&&s.isVector2)t.uniforms[i]={type:"v2",value:s.toArray()};else if(s&&s.isVector3)t.uniforms[i]={type:"v3",value:s.toArray()};else if(s&&s.isVector4)t.uniforms[i]={type:"v4",value:s.toArray()};else if(s&&s.isMatrix3)t.uniforms[i]={type:"m3",value:s.toArray()};else if(s&&s.isMatrix4)t.uniforms[i]={type:"m4",value:s.toArray()};else t.uniforms[i]={value:s}}if(Object.keys(this.defines).length>0)t.defines=this.defines;t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let i in this.extensions)if(this.extensions[i]===!0)n[i]=!0;if(Object.keys(n).length>0)t.extensions=n;return t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let n in e.uniforms){let i=e.uniforms[n];switch(this.uniforms[n]={},i.type){case"t":this.uniforms[n].value=t[i.value]||null;break;case"c":this.uniforms[n].value=new Re().setHex(i.value);break;case"v2":this.uniforms[n].value=new Ue().fromArray(i.value);break;case"v3":this.uniforms[n].value=new U().fromArray(i.value);break;case"v4":this.uniforms[n].value=new ot().fromArray(i.value);break;case"m3":this.uniforms[n].value=new Fe().fromArray(i.value);break;case"m4":this.uniforms[n].value=new Oe().fromArray(i.value);break;default:this.uniforms[n].value=i.value}}if(e.defines!==void 0)this.defines=e.defines;if(e.vertexShader!==void 0)this.vertexShader=e.vertexShader;if(e.fragmentShader!==void 0)this.fragmentShader=e.fragmentShader;if(e.glslVersion!==void 0)this.glslVersion=e.glslVersion;if(e.extensions!==void 0)for(let n in e.extensions)this.extensions[n]=e.extensions[n];if(e.lights!==void 0)this.lights=e.lights;if(e.clipping!==void 0)this.clipping=e.clipping;return this}}class Hl extends en{constructor(e){super(e);this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class Gn extends Qt{constructor(e){super();this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Re(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Re(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new Ue(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ii,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class ln extends Gn{constructor(e){super();this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new Ue(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return Ze(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(t){this.ior=(1+0.4*t)/(1-0.4*t)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new Re(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new Re(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new Re(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._retroreflectivity=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){if(this._anisotropy>0!==e>0)this.version++;this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){if(this._clearcoat>0!==e>0)this.version++;this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){if(this._iridescence>0!==e>0)this.version++;this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){if(this._dispersion>0!==e>0)this.version++;this._dispersion=e}get retroreflectivity(){return this._retroreflectivity}set retroreflectivity(e){if(this._retroreflectivity>0!==e>0)this.version++;this._retroreflectivity=e}get sheen(){return this._sheen}set sheen(e){if(this._sheen>0!==e>0)this.version++;this._sheen=e}get transmission(){return this._transmission}set transmission(e){if(this._transmission>0!==e>0)this.version++;this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.retroreflectivity=e.retroreflectivity,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}}class Fs extends Qt{constructor(e){super();this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=3200,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Vl extends Qt{constructor(e){super();this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}function yi(e,t){if(!e||e.constructor===t)return e;if(typeof t.BYTES_PER_ELEMENT==="number")return new t(e);return Array.prototype.slice.call(e)}function $o(e){return e!==void 0&&e.inTangents!==void 0&&e.outTangents!==void 0}function Jx(e){function t(r,s){return e[r]-e[s]}let n=e.length,i=Array(n);for(let r=0;r!==n;++r)i[r]=r;return i.sort(t),i}function nm(e,t,n){let i=e.length,r=new e.constructor(i);for(let s=0,o=0;o!==i;++s){let a=n[s]*t;for(let c=0;c!==t;++c)r[o++]=e[a+c]}return r}function Kx(e,t,n,i){let r=1,s=e[0];while(s!==void 0&&s[i]===void 0)s=e[r++];if(s===void 0)return;let o=s[i];if(o===void 0)return;if(Array.isArray(o))do{if(o=s[i],o!==void 0)t.push(s.time),n.push(...o);s=e[r++]}while(s!==void 0);else if(o.toArray!==void 0)do{if(o=s[i],o!==void 0)t.push(s.time),o.toArray(n,n.length);s=e[r++]}while(s!==void 0);else do{if(o=s[i],o!==void 0)t.push(s.time),n.push(o);s=e[r++]}while(s!==void 0)}class oi{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,i=t[n],r=t[n-1];e:{t:{let s;n:{i:if(!(e<i)){for(let o=n+2;;){if(i===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=i,i=t[++n],e<i)break t}s=t.length;break n}if(!(e>=r)){let o=t[1];if(e<o)n=2,r=o;for(let a=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===a)break;if(i=r,r=t[--n-1],e>=r)break t}s=n,n=0;break n}break e}while(n<s){let o=n+s>>>1;if(e<t[o])s=o;else n=o+1}if(i=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i;for(let s=0;s!==i;++s)t[s]=n[r+s];return t}interpolate_(){throw Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}}class Wl extends oi{constructor(e,t,n,i){super(e,t,n,i);this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:2400,endingEnd:2400}}intervalChanged_(e,t,n){let i=this.parameterPositions,r=e-2,s=e+1,o=i[r],a=i[s];if(o===void 0)switch(this.getSettings_().endingStart){case 2401:r=e,o=2*t-n;break;case 2402:r=i.length-2,o=t+i[r]-i[r+1];break;default:r=e,o=n}if(a===void 0)switch(this.getSettings_().endingEnd){case 2401:s=e,a=2*n-t;break;case 2402:s=1,a=n+i[1]-i[0];break;default:s=e-1,a=t}let c=(n-t)*0.5,l=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(a-n),this._offsetPrev=r*l,this._offsetNext=s*l}interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=e*o,c=a-o,l=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,h=this._weightNext,f=(n-t)/(i-t),g=f*f,S=g*f,p=-d*S+2*d*g-d*f,m=(1+d)*S+(-1.5-2*d)*g+(-0.5+d)*f+1,T=(-1-h)*S+(1.5+h)*g+0.5*f,A=h*S-h*g;for(let v=0;v!==o;++v)r[v]=p*s[l+v]+m*s[c+v]+T*s[a+v]+A*s[u+v];return r}}class ma extends oi{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=e*o,c=a-o,l=(n-t)/(i-t),u=1-l;for(let d=0;d!==o;++d)r[d]=s[c+d]*u+s[a+d]*l;return r}}class $l extends oi{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}}class Zl extends oi{interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=e*o,c=a-o,l=this.inTangents,u=this.outTangents;if(!l||!u){let f=(n-t)/(i-t),g=1-f;for(let S=0;S!==o;++S)r[S]=s[c+S]*g+s[a+S]*f;return r}let d=o*2,h=e-1;for(let f=0;f!==o;++f){let g=s[c+f],S=s[a+f],p=h*d+f*2,m=u[p],T=u[p+1],A=e*d+f*2,v=l[A],w=l[A+1],E=Qx(n,t,m,v,i);r[f]=dg(E,g,T,w,S)}return r}}function dg(e,t,n,i,r){let s=1-e;return s*s*s*t+3*s*s*e*n+3*s*e*e*i+e*e*e*r}function jx(e,t,n,i,r){let s=1-e;return 3*s*s*(n-t)+6*s*e*(i-n)+3*e*e*(r-i)}function Qx(e,t,n,i,r){let s=(e-t)/(r-t);for(let o=0;o<8;o++){let a=dg(s,t,n,i,r)-e;if(Math.abs(a)<0.0000000001)break;let c=jx(s,t,n,i,r);if(Math.abs(c)<0.0000000001)break;s=Math.max(0,Math.min(1,s-a/c))}return s}class un{constructor(e,t,n,i){if(e===void 0)throw Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=yi(t,this.TimeBufferType),this.values=yi(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:yi(e.times,Array),values:yi(e.values,Array)};let i=e.getInterpolation();if(i!==e.DefaultInterpolation)n.interpolation=i;if($o(e.settings))n.settings={inTangents:yi(e.settings.inTangents,Array),outTangents:yi(e.settings.outTangents,Array)}}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new $l(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new ma(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new Wl(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new Zl(this.times,this.values,this.getValueSize(),e);if(this.settings)t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents;return t}setInterpolation(e){let t;switch(e){case 2300:t=this.InterpolantFactoryMethodDiscrete;break;case 2301:t=this.InterpolantFactoryMethodLinear;break;case 2302:t=this.InterpolantFactoryMethodSmooth;break;case 2303:t=this.InterpolantFactoryMethodBezier;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(n);return Te("KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return 2300;case this.InterpolantFactoryMethodLinear:return 2301;case this.InterpolantFactoryMethodSmooth:return 2302;case this.InterpolantFactoryMethodBezier:return 2303}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e;if($o(this.settings))im(this.settings.inTangents,e),im(this.settings.outTangents,e)}return this}trim(e,t){let n=this.times,i=n.length,r=0,s=i-1;while(r!==i&&n[r]<e)++r;while(s!==-1&&n[s]>t)--s;if(++s,r!==0||s!==i){if(r>=s)s=Math.max(s,1),r=s-1;let o=this.getValueSize();this.times=n.slice(r,s),this.values=this.values.slice(r*o,s*o)}return this}validate(){let e=!0,t=this.getValueSize();if(t-Math.floor(t)!==0)Ne("KeyframeTrack: Invalid value size in track.",this),e=!1;let n=this.times,i=this.values,r=n.length;if(r===0)Ne("KeyframeTrack: Track is empty.",this),e=!1;let s=null;for(let o=0;o!==r;o++){let a=n[o];if(typeof a==="number"&&isNaN(a)){Ne("KeyframeTrack: Time is not a valid number.",this,o,a),e=!1;break}if(s!==null&&s>a){Ne("KeyframeTrack: Out of order keys.",this,o,a,s),e=!1;break}s=a}if(i!==void 0){if(lx(i))for(let o=0,a=i.length;o!==a;++o){let c=i[o];if(isNaN(c)){Ne("KeyframeTrack: Value is not a valid number.",this,o,c),e=!1;break}}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===2302,r=e.length-1,s=1;for(let o=1;o<r;++o){let a=!1,c=e[o],l=e[o+1];if(c!==l&&(o!==1||c!==e[0]))if(!i){let u=o*n,d=u-n,h=u+n;for(let f=0;f!==n;++f){let g=t[u+f];if(g!==t[d+f]||g!==t[h+f]){a=!0;break}}}else a=!0;if(a){if(o!==s){e[s]=e[o];let u=o*n,d=s*n;for(let h=0;h!==n;++h)t[d+h]=t[u+h]}++s}}if(r>0){e[s]=e[r];for(let o=r*n,a=s*n,c=0;c!==n;++c)t[a+c]=t[o+c];++s}if(s!==e.length)this.times=e.slice(0,s),this.values=t.slice(0,s*n);else this.times=e,this.values=t;return this}clone(){let e=this.times.slice(),t=this.values.slice(),i=new this.constructor(this.name,e,t);if(i.createInterpolant=this.createInterpolant,$o(this.settings))i.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()};return i}}function im(e,t){for(let n=0,i=e.length;n!==i;n+=2)e[n]*=t}un.prototype.ValueTypeName="";un.prototype.TimeBufferType=Float32Array;un.prototype.ValueBufferType=Float32Array;un.prototype.DefaultInterpolation=2301;class Ci extends un{constructor(e,t,n){super(e,t,n)}}Ci.prototype.ValueTypeName="bool";Ci.prototype.ValueBufferType=Array;Ci.prototype.DefaultInterpolation=2300;Ci.prototype.InterpolantFactoryMethodLinear=void 0;Ci.prototype.InterpolantFactoryMethodSmooth=void 0;class ga extends un{constructor(e,t,n,i){super(e,t,n,i)}}ga.prototype.ValueTypeName="color";class Ii extends un{constructor(e,t,n,i){super(e,t,n,i)}}Ii.prototype.ValueTypeName="number";class Xl extends oi{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=(n-t)/(i-t),c=e*o;for(let l=c+o;c!==l;c+=4)Gt.slerpFlat(r,0,s,c-o,s,c,a);return r}}class Rn extends un{constructor(e,t,n,i){super(e,t,n,i)}InterpolantFactoryMethodLinear(e){return new Xl(this.times,this.values,this.getValueSize(),e)}}Rn.prototype.ValueTypeName="quaternion";Rn.prototype.InterpolantFactoryMethodSmooth=void 0;class Pi extends un{constructor(e,t,n){super(e,t,n)}}Pi.prototype.ValueTypeName="string";Pi.prototype.ValueBufferType=Array;Pi.prototype.DefaultInterpolation=2300;Pi.prototype.InterpolantFactoryMethodLinear=void 0;Pi.prototype.InterpolantFactoryMethodSmooth=void 0;class Hn extends un{constructor(e,t,n,i){super(e,t,n,i)}}Hn.prototype.ValueTypeName="vector";class ri{constructor(e="",t=-1,n=[],i=2500){if(this.name=e,this.tracks=n,this.duration=t,this.blendMode=i,this.uuid=Mn(),this.userData={},this.duration<0)this.resetDuration()}static parse(e){let t=[],n=e.tracks,i=1/(e.fps||1);for(let s=0,o=n.length;s!==o;++s)t.push(tv(n[s]).scale(i));let r=new this(e.name,e.duration,t,e.blendMode);return r.uuid=e.uuid,r.userData=JSON.parse(e.userData||"{}"),r}static toJSON(e){let t=[],n=e.tracks,i={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode,userData:JSON.stringify(e.userData)};for(let r=0,s=n.length;r!==s;++r)t.push(un.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(e,t,n,i){let r=t.length,s=[];for(let o=0;o<r;o++){let a=[],c=[];a.push((o+r-1)%r,o,(o+1)%r),c.push(0,1,0);let l=Jx(a);if(a=nm(a,1,l),c=nm(c,1,l),!i&&a[0]===0)a.push(r),c.push(c[0]);s.push(new Ii(".morphTargetInfluences["+t[o].name+"]",a,c).scale(1/n))}return new this(e,-1,s)}static findByName(e,t){let n=e;if(!Array.isArray(e)){let i=e;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===t)return n[i];return null}static CreateClipsFromMorphTargetSequences(e,t,n){let i={},r=/^([\w-]*?)([\d]+)$/;for(let o=0,a=e.length;o<a;o++){let c=e[o],l=c.name.match(r);if(l&&l.length>1){let u=l[1],d=i[u];if(!d)i[u]=d=[];d.push(c)}}let s=[];for(let o in i)s.push(this.CreateFromMorphTargetSequence(o,i[o],t,n));return s}resetDuration(){let e=this.tracks,t=0;for(let n=0,i=e.length;n!==i;++n){let r=this.tracks[n];t=Math.max(t,r.times[r.times.length-1])}return this.duration=t,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){let e=[];for(let n=0;n<this.tracks.length;n++)e.push(this.tracks[n].clone());let t=new this.constructor(this.name,this.duration,e,this.blendMode);return t.userData=JSON.parse(JSON.stringify(this.userData)),t}toJSON(){return this.constructor.toJSON(this)}}function ev(e){switch(e.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return Ii;case"vector":case"vector2":case"vector3":case"vector4":return Hn;case"color":return ga;case"quaternion":return Rn;case"bool":case"boolean":return Ci;case"string":return Pi}throw Error("THREE.KeyframeTrack: Unsupported typeName: "+e)}function tv(e){if(e.type===void 0)throw Error("THREE.KeyframeTrack: track type undefined, can not parse");let t=ev(e.type);if(e.times===void 0){let i=[],r=[];Kx(e.keys,i,r,"value"),e.times=i,e.values=r}let n;if(t.parse!==void 0)n=t.parse(e);else n=new t(e.name,e.times,e.values,e.interpolation);if($o(e.settings))n.settings={inTangents:yi(e.settings.inTangents,Float32Array),outTangents:yi(e.settings.outTangents,Float32Array)};return n}var Dn={enabled:!1,files:{},add:function(e,t){if(this.enabled===!1)return;if(rm(e))return;this.files[e]=t},get:function(e){if(this.enabled===!1)return;if(rm(e))return;return this.files[e]},remove:function(e){delete this.files[e]},clear:function(){this.files={}}};function rm(e){try{let t=e.slice(e.indexOf(":")+1);return new URL(t).protocol==="blob:"}catch(t){return!1}}class zs{constructor(e,t,n){let i=this,r=!1,s=0,o=0,a=void 0,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this._abortController=null,this.itemStart=function(l){if(o++,r===!1){if(i.onStart!==void 0)i.onStart(l,s,o)}r=!0},this.itemEnd=function(l){if(s++,i.onProgress!==void 0)i.onProgress(l,s,o);if(s===o){if(r=!1,i.onLoad!==void 0)i.onLoad()}},this.itemError=function(l){if(i.onError!==void 0)i.onError(l)},this.resolveURL=function(l){if(l=l.normalize("NFC"),a)return a(l);return l},this.setURLModifier=function(l){return a=l,this},this.addHandler=function(l,u){return c.push(l,u),this},this.removeHandler=function(l){let u=c.indexOf(l);if(u!==-1)c.splice(u,2);return this},this.getHandler=function(l){for(let u=0,d=c.length;u<d;u+=2){let h=c[u],f=c[u+1];if(h.global)h.lastIndex=0;if(h.test(l))return f}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){if(!this._abortController)this._abortController=new AbortController;return this._abortController}}var fg=new zs;class ai{constructor(e){if(this.manager=e!==void 0?e:fg,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(e,t){let n=this;return new Promise(function(i,r){n.load(e,i,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}}ai.DEFAULT_MATERIAL_NAME="__DEFAULT";var ti={};class pg extends Error{constructor(e,t){super(e);this.response=t}}class ks extends ai{constructor(e){super(e);this.mimeType="",this.responseType="",this._abortController=new AbortController}load(e,t,n,i){if(e===void 0)e="";if(this.path!==void 0)e=this.path+e;e=this.manager.resolveURL(e);let r=Dn.get(`file:${e}`);if(r!==void 0){this.manager.itemStart(e),setTimeout(()=>{if(t)t(r);this.manager.itemEnd(e)},0);return}if(ti[e]!==void 0){ti[e].push({onLoad:t,onProgress:n,onError:i});return}ti[e]=[],ti[e].push({onLoad:t,onProgress:n,onError:i});let s=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any==="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,a=this.responseType;fetch(s).then((c)=>{if(c.status===200||c.status===0){if(c.status===0)Te("FileLoader: HTTP Status 0 received.");if(typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;let l=ti[e],u=c.body.getReader(),d=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),h=d?parseInt(d):0,f=h!==0,g=0,S=new ReadableStream({start(p){m();function m(){u.read().then(({done:T,value:A})=>{if(T)p.close();else{g+=A.byteLength;let v=new ProgressEvent("progress",{lengthComputable:f,loaded:g,total:h});for(let w=0,E=l.length;w<E;w++){let R=l[w];if(R.onProgress)R.onProgress(v)}p.enqueue(A),m()}},(T)=>{p.error(T)})}}});return new Response(S)}else throw new pg(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then((c)=>{switch(a){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then((l)=>new DOMParser().parseFromString(l,o));case"json":return c.json();default:if(o==="")return c.text();else{let u=/charset="?([^;"\s]*)"?/i.exec(o),d=u&&u[1]?u[1].toLowerCase():void 0,h=new TextDecoder(d);return c.arrayBuffer().then((f)=>h.decode(f))}}}).then((c)=>{Dn.add(`file:${e}`,c);let l=ti[e];delete ti[e];for(let u=0,d=l.length;u<d;u++){let h=l[u];if(h.onLoad)h.onLoad(c)}}).catch((c)=>{let l=ti[e];if(l===void 0)throw this.manager.itemError(e),c;delete ti[e];for(let u=0,d=l.length;u<d;u++){let h=l[u];if(h.onError)h.onError(c)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}var Ar=new WeakMap;class ql extends ai{constructor(e){super(e)}load(e,t,n,i){if(this.path!==void 0)e=this.path+e;e=this.manager.resolveURL(e);let r=this,s=Dn.get(`image:${e}`);if(s!==void 0){if(s.complete===!0)r.manager.itemStart(e),setTimeout(function(){if(t)t(s);r.manager.itemEnd(e)},0);else{let u=Ar.get(s);if(u===void 0)u=[],Ar.set(s,u);u.push({onLoad:t,onError:i})}return s}let o=Pr("img");function a(){if(l(),t)t(this);let u=Ar.get(this)||[];for(let d=0;d<u.length;d++){let h=u[d];if(h.onLoad)h.onLoad(this)}Ar.delete(this),r.manager.itemEnd(e)}function c(u){if(l(),i)i(u);Dn.remove(`image:${e}`);let d=Ar.get(this)||[];for(let h=0;h<d.length;h++){let f=d[h];if(f.onError)f.onError(u)}Ar.delete(this),r.manager.itemError(e),r.manager.itemEnd(e)}function l(){o.removeEventListener("load",a,!1),o.removeEventListener("error",c,!1)}if(o.addEventListener("load",a,!1),o.addEventListener("error",c,!1),e.slice(0,5)!=="data:"){if(this.crossOrigin!==void 0)o.crossOrigin=this.crossOrigin}return Dn.add(`image:${e}`,o),r.manager.itemStart(e),o.src=e,o}}class _a extends ai{constructor(e){super(e)}load(e,t,n,i){let r=new _t,s=new ql(this.manager);return s.setCrossOrigin(this.crossOrigin),s.setPath(this.path),s.load(e,function(o){if(r.image=o,r.needsUpdate=!0,t!==void 0)t(r)},n,i),r}}class Vr extends lt{constructor(e,t=1){super();this.isLight=!0,this.type="Light",this.color=new Re(e),this.intensity=t}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}}class xa extends Vr{constructor(e,t,n){super(e,n);this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(lt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Re(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}}var Ic=new Oe,sm=new U,om=new U;class Bs{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Ue(512,512),this.mapType=1009,this.map=null,this.mapPass=null,this.matrix=new Oe,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Ls,this._frameExtents=new Ue(1,1),this._viewportCount=1,this._viewports=[new ot(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera;sm.setFromMatrixPosition(e.matrixWorld),t.position.copy(sm),om.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(om),t.updateMatrixWorld(),this._updateMatrix(t,this.matrix,this._frustum)}_updateMatrix(e,t,n,i){Ic.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),n.setFromProjectionMatrix(Ic,e.coordinateSystem,e.reversedDepth);let r=this._frameExtents,s=i?i.z/r.x:1,o=i?i.w/r.y:1,a=i?i.x/r.x:0,c=i?i.y/r.y:0;if(e.coordinateSystem===2001||e.reversedDepth)t.set(0.5*s,0,0,0.5*s+a,0,0.5*o,0,0.5*o+c,0,0,1,0,0,0,0,1);else t.set(0.5*s,0,0,0.5*s+a,0,0.5*o,0,0.5*o+c,0,0,0.5,0.5,0,0,0,1);t.multiply(Ic)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){if(this.map)this.map.dispose();if(this.mapPass)this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return e.intensity=this.intensity,e.bias=this.bias,e.normalBias=this.normalBias,e.radius=this.radius,e.blurSamples=this.blurSamples,e.mapSize=this.mapSize.toArray(),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}var Vo=new U,Wo=new Gt,Nn=new U;class va extends lt{constructor(){super();this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Oe,this.projectionMatrix=new Oe,this.projectionMatrixInverse=new Oe,this.coordinateSystem=2000,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){if(super.updateMatrixWorld(e),this.matrixWorld.decompose(Vo,Wo,Nn),Nn.x===1&&Nn.y===1&&Nn.z===1)this.matrixWorldInverse.copy(this.matrixWorld).invert();else this.matrixWorldInverse.compose(Vo,Wo,Nn.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){if(super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(Vo,Wo,Nn),Nn.x===1&&Nn.y===1&&Nn.z===1)this.matrixWorldInverse.copy(this.matrixWorld).invert();else this.matrixWorldInverse.compose(Vo,Wo,Nn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}var vi=new U,am=new Ue,cm=new Ue;class Lt extends va{constructor(e=50,t=1,n=0.1,i=2000){super();this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=0.5*this.getFilmHeight()/e;this.fov=$i*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(_s*0.5*this.fov);return 0.5*this.getFilmHeight()/e}getEffectiveFOV(){return $i*2*Math.atan(Math.tan(_s*0.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){vi.set(-1,-1,0.5).applyMatrix4(this.projectionMatrixInverse),t.set(vi.x,vi.y).multiplyScalar(-e/vi.z),vi.set(1,1,0.5).applyMatrix4(this.projectionMatrixInverse),n.set(vi.x,vi.y).multiplyScalar(-e/vi.z)}getViewSize(e,t){return this.getViewBounds(e,am,cm),t.subVectors(cm,am)}setViewOffset(e,t,n,i,r,s){if(this.aspect=e/t,this.view===null)this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1};this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=s,this.updateProjectionMatrix()}clearViewOffset(){if(this.view!==null)this.view.enabled=!1;this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(_s*0.5*this.fov)/this.zoom,n=2*t,i=this.aspect*n,r=-0.5*i,s=this.view;if(this.view!==null&&this.view.enabled){let{fullWidth:a,fullHeight:c}=s;r+=s.offsetX*i/a,t-=s.offsetY*n/c,i*=s.width/a,n*=s.height/c}let o=this.filmOffset;if(o!==0)r+=e*o/this.getFilmWidth();this.projectionMatrix.makePerspective(r,r+i,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);if(t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null)t.object.view=Object.assign({},this.view);return t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class mg extends Bs{constructor(){super(new Lt(50,1,0.5,500));this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){let t=this.camera,n=$i*2*e.angle*this.focus,i=this.mapSize.width/this.mapSize.height*this.aspect,r=e.distance||t.far;if(n!==t.fov||i!==t.aspect||r!==t.far)t.fov=n,t.aspect=i,t.far=r,t.updateProjectionMatrix();super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this.aspect=e.aspect,this}toJSON(){let e=super.toJSON();return e.focus=this.focus,e.aspect=this.aspect,e}}class Wr extends Vr{constructor(e,t,n=0,i=Math.PI/3,r=0,s=2){super(e,t);this.isSpotLight=!0,this.type="SpotLight",this.position.copy(lt.DEFAULT_UP),this.updateMatrix(),this.target=new lt,this.distance=n,this.angle=i,this.penumbra=r,this.decay=s,this.map=null,this.shadow=new mg}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.map=e.map,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);if(t.object.distance=this.distance,t.object.angle=this.angle,t.object.decay=this.decay,t.object.penumbra=this.penumbra,t.object.target=this.target.uuid,this.map&&this.map.isTexture)t.object.map=this.map.toJSON(e).uuid;return t.object.shadow=this.shadow.toJSON(),t}}class gg extends Bs{constructor(){super(new Lt(90,1,0.5,500));this.isPointLightShadow=!0}}class $r extends Vr{constructor(e,t,n=0,i=2){super(e,t);this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new gg}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}}class nr extends va{constructor(e=-1,t=1,n=1,i=-1,r=0.1,s=2000){super();this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=r,this.far=s,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,r,s){if(this.view===null)this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1};this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=s,this.updateProjectionMatrix()}clearViewOffset(){if(this.view!==null)this.view.enabled=!1;this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-e,s=n+e,o=i+t,a=i-t;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,l=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,s=r+c*this.view.width,o-=l*this.view.offsetY,a=o-l*this.view.height}this.projectionMatrix.makeOrthographic(r,s,o,a,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);if(t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null)t.object.view=Object.assign({},this.view);return t}}class _g extends Bs{constructor(){super(new nr(-5,5,5,-5,0.5,500));this.isDirectionalLightShadow=!0}}class ir extends Vr{constructor(e,t){super(e,t);this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(lt.DEFAULT_UP),this.updateMatrix(),this.target=new lt,this.shadow=new _g}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}}class Li{static extractUrlBase(e){let t=e.lastIndexOf("/");if(t===-1)return"./";return e.slice(0,t+1)}static resolveURL(e,t){if(typeof e!=="string"||e==="")return"";if(/^https?:\/\//i.test(t)&&/^\//.test(e))t=t.replace(/(^https?:\/\/[^\/]+).*/i,"$1");if(/^(https?:)?\/\//i.test(e))return e;if(/^data:.*,.*$/i.test(e))return e;if(/^blob:.*$/i.test(e))return e;return t+e}}var Pc=new WeakMap;class ya extends ai{constructor(e){super(e);if(this.isImageBitmapLoader=!0,typeof createImageBitmap>"u")Te("ImageBitmapLoader: createImageBitmap() not supported.");if(typeof fetch>"u")Te("ImageBitmapLoader: fetch() not supported.");this.options={premultiplyAlpha:"none"},this._abortController=new AbortController}setOptions(e){return this.options=e,this}load(e,t,n,i){if(e===void 0)e="";if(this.path!==void 0)e=this.path+e;e=this.manager.resolveURL(e);let r=this,s=Dn.get(`image-bitmap:${e}`);if(s!==void 0){if(r.manager.itemStart(e),s.then){s.then((c)=>{if(Pc.has(s)===!0){if(i)i(Pc.get(s));r.manager.itemError(e),r.manager.itemEnd(e)}else{if(t)t(c);r.manager.itemEnd(e)}});return}setTimeout(function(){if(t)t(s);r.manager.itemEnd(e)},0);return}let o={};o.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",o.headers=this.requestHeader,o.signal=typeof AbortSignal.any==="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;let a=fetch(e,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign({},r.options,{colorSpaceConversion:"none"}))}).then(function(c){if(Dn.add(`image-bitmap:${e}`,c),t)t(c);return r.manager.itemEnd(e),c}).catch(function(c){if(i)i(c);Pc.set(a,c),Dn.remove(`image-bitmap:${e}`),r.manager.itemError(e),r.manager.itemEnd(e)});Dn.add(`image-bitmap:${e}`,a),r.manager.itemStart(e)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}var Rr=-90,Cr=1;class Yl extends lt{constructor(e,t,n){super();this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new Lt(Rr,Cr,e,t);i.layers=this.layers,this.add(i);let r=new Lt(Rr,Cr,e,t);r.layers=this.layers,this.add(r);let s=new Lt(Rr,Cr,e,t);s.layers=this.layers,this.add(s);let o=new Lt(Rr,Cr,e,t);o.layers=this.layers,this.add(o);let a=new Lt(Rr,Cr,e,t);a.layers=this.layers,this.add(a);let c=new Lt(Rr,Cr,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,i,r,s,o,a]=t;for(let c of t)this.remove(c);if(e===2000)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),s.up.set(0,0,1),s.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),a.up.set(0,1,0),a.lookAt(0,0,-1);else if(e===2001)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),s.up.set(0,0,-1),s.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),a.up.set(0,-1,0),a.lookAt(0,0,-1);else throw Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let c of t)this.add(c),c.updateMatrixWorld()}update(e,t){if(this.parent===null)this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;if(this.coordinateSystem!==e.coordinateSystem)this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem();let[r,s,o,a,c,l]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),h=e.getActiveMipmapLevel(),f=e.xr.enabled;e.xr.enabled=!1;let g=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let S=!1;if(e.isWebGLRenderer===!0)S=e.state.buffers.depth.getReversed();else S=e.reversedDepthBuffer;if(e.setRenderTarget(n,0,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,r),e.setRenderTarget(n,1,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,s),e.setRenderTarget(n,2,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,o),e.setRenderTarget(n,3,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,a),e.setRenderTarget(n,4,i),S&&e.autoClear===!1)e.clearDepth();if(e.render(t,c),n.texture.generateMipmaps=g,e.setRenderTarget(n,5,i),S&&e.autoClear===!1)e.clearDepth();e.render(t,l),e.setRenderTarget(u,d,h),e.xr.enabled=f,n.texture.needsPMREMUpdate=!0}}class Jl extends Lt{constructor(e=[]){super();this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}class Kl{constructor(e,t,n){this.binding=e,this.valueSize=n;let i,r,s;switch(t){case"quaternion":i=this._slerp,r=this._slerpAdditive,s=this._setAdditiveIdentityQuaternion,this.buffer=new Float64Array(n*6),this._workIndex=5;break;case"string":case"bool":i=this._select,r=this._select,s=this._setAdditiveIdentityOther,this.buffer=Array(n*5);break;default:i=this._lerp,r=this._lerpAdditive,s=this._setAdditiveIdentityNumeric,this.buffer=new Float64Array(n*5)}this._mixBufferRegion=i,this._mixBufferRegionAdditive=r,this._setIdentity=s,this._origIndex=3,this._addIndex=4,this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,this.useCount=0,this.referenceCount=0}accumulate(e,t){let n=this.buffer,i=this.valueSize,r=e*i+i,s=this.cumulativeWeight;if(s===0){for(let o=0;o!==i;++o)n[r+o]=n[o];s=t}else{s+=t;let o=t/s;this._mixBufferRegion(n,r,0,o,i)}this.cumulativeWeight=s}accumulateAdditive(e){let t=this.buffer,n=this.valueSize,i=n*this._addIndex;if(this.cumulativeWeightAdditive===0)this._setIdentity();this._mixBufferRegionAdditive(t,i,0,e,n),this.cumulativeWeightAdditive+=e}apply(e){let t=this.valueSize,n=this.buffer,i=e*t+t,r=this.cumulativeWeight,s=this.cumulativeWeightAdditive,o=this.binding;if(this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,r<1){let a=t*this._origIndex;this._mixBufferRegion(n,i,a,1-r,t)}if(s>0)this._mixBufferRegionAdditive(n,i,this._addIndex*t,1,t);for(let a=t,c=t+t;a!==c;++a)if(n[a]!==n[a+t]){o.setValue(n,i);break}}saveOriginalState(){let e=this.binding,t=this.buffer,n=this.valueSize,i=n*this._origIndex;e.getValue(t,i);for(let r=n,s=i;r!==s;++r)t[r]=t[i+r%n];this._setIdentity(),this.cumulativeWeight=0,this.cumulativeWeightAdditive=0}restoreOriginalState(){let e=this.valueSize*3;this.binding.setValue(this.buffer,e)}_setAdditiveIdentityNumeric(){let e=this._addIndex*this.valueSize,t=e+this.valueSize;for(let n=e;n<t;n++)this.buffer[n]=0}_setAdditiveIdentityQuaternion(){this._setAdditiveIdentityNumeric(),this.buffer[this._addIndex*this.valueSize+3]=1}_setAdditiveIdentityOther(){let e=this._origIndex*this.valueSize,t=this._addIndex*this.valueSize;for(let n=0;n<this.valueSize;n++)this.buffer[t+n]=this.buffer[e+n]}_select(e,t,n,i,r){if(i>=0.5)for(let s=0;s!==r;++s)e[t+s]=e[n+s]}_slerp(e,t,n,i){Gt.slerpFlat(e,t,e,t,e,n,i)}_slerpAdditive(e,t,n,i,r){let s=this._workIndex*r;Gt.multiplyQuaternionsFlat(e,s,e,t,e,n),Gt.slerpFlat(e,t,e,t,e,s,i)}_lerp(e,t,n,i,r){let s=1-i;for(let o=0;o!==r;++o){let a=t+o;e[a]=e[a]*s+e[n+o]*i}}_lerpAdditive(e,t,n,i,r){for(let s=0;s!==r;++s){let o=t+s;e[o]=e[o]+e[n+s]*i}}}var jl="\\[\\]\\.:\\/",nv=new RegExp("["+jl+"]","g"),Ql="[^"+jl+"]",iv="[^"+jl.replace("\\.","")+"]",rv=/((?:WC+[\/:])*)/.source.replace("WC",Ql),sv=/(WCOD+)?/.source.replace("WCOD",iv),ov=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Ql),av=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Ql),cv=new RegExp("^"+rv+sv+ov+av+"$"),lv=["material","materials","bones","map"];class xg{constructor(e,t,n){let i=n||Qe.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,i)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];if(i!==void 0)i.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}}class Qe{constructor(e,t,n){this.path=t,this.parsedPath=n||Qe.parseTrackName(t),this.node=Qe.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){if(!(e&&e.isAnimationObjectGroup))return new Qe(e,t,n);else return new Qe.Composite(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(nv,"")}static parseTrackName(e){let t=cv.exec(e);if(t===null)throw Error("THREE.PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);if(lv.indexOf(r)!==-1)n.nodeName=n.nodeName.substring(0,i),n.objectName=r}if(n.propertyName===null||n.propertyName.length===0)throw Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let s=0;s<r.length;s++){let o=r[s];if(o.name===t||o.uuid===t)return o;let a=n(o.children);if(a)return a}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,{objectName:n,propertyName:i,propertyIndex:r}=t;if(!e)e=Qe.findNode(this.rootNode,t.nodeName),this.node=e;if(this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){Te("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=t.objectIndex;switch(n){case"materials":if(!e.material){Ne("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){Ne("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){Ne("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let l=0;l<e.length;l++)if(e[l].name===c){c=l;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){Ne("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){Ne("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){Ne("PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(c!==void 0){if(e[c]===void 0){Ne("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[c]}}let s=e[i];if(s===void 0){let c=t.nodeName;Ne("PropertyBinding: Trying to update property for track: "+c+"."+i+" but it wasn't found.",e);return}let o=this.Versioning.None;if(this.targetObject=e,e.isMaterial===!0)o=this.Versioning.NeedsUpdate;else if(e.isObject3D===!0)o=this.Versioning.MatrixWorldNeedsUpdate;let a=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry){Ne("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){Ne("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}if(e.morphTargetDictionary[r]!==void 0)r=e.morphTargetDictionary[r]}a=this.BindingType.ArrayElement,this.resolvedProperty=s,this.propertyIndex=r}else if(s.fromArray!==void 0&&s.toArray!==void 0)a=this.BindingType.HasFromToArray,this.resolvedProperty=s;else if(Array.isArray(s))a=this.BindingType.EntireArray,this.resolvedProperty=s;else this.propertyName=i;this.getValue=this.GetterByBindingType[a],this.setValue=this.SetterByBindingTypeAndVersioning[a][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}}Qe.Composite=xg;Qe.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};Qe.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};Qe.prototype.GetterByBindingType=[Qe.prototype._getValue_direct,Qe.prototype._getValue_array,Qe.prototype._getValue_arrayElement,Qe.prototype._getValue_toArray];Qe.prototype.SetterByBindingTypeAndVersioning=[[Qe.prototype._setValue_direct,Qe.prototype._setValue_direct_setNeedsUpdate,Qe.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Qe.prototype._setValue_array,Qe.prototype._setValue_array_setNeedsUpdate,Qe.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Qe.prototype._setValue_arrayElement,Qe.prototype._setValue_arrayElement_setNeedsUpdate,Qe.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Qe.prototype._setValue_fromArray,Qe.prototype._setValue_fromArray_setNeedsUpdate,Qe.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];class eu{constructor(e,t,n=null,i=t.blendMode){this._mixer=e,this._clip=t,this._localRoot=n,this.blendMode=i;let r=t.tracks,s=r.length,o=Array(s),a={endingStart:2400,endingEnd:2400};for(let c=0;c!==s;++c){let l=r[c].createInterpolant(null);o[c]=l,l.settings=a}this._interpolantSettings=a,this._interpolants=o,this._propertyBindings=Array(s),this._cacheIndex=null,this._byClipCacheIndex=null,this._timeScaleInterpolant=null,this._restoreTimeScale=null,this._weightInterpolant=null,this.loop=2201,this._loopCount=-1,this._startTime=null,this.time=0,this.timeScale=1,this._effectiveTimeScale=1,this.weight=1,this._effectiveWeight=1,this.repetitions=1/0,this.paused=!1,this.enabled=!0,this.clampWhenFinished=!1,this.zeroSlopeAtStart=!0,this.zeroSlopeAtEnd=!0}play(){return this._mixer._activateAction(this),this}stop(){return this._mixer._deactivateAction(this),this.reset()}reset(){return this.paused=!1,this.enabled=!0,this.time=0,this._loopCount=-1,this._startTime=null,this.stopFading().stopWarping()}isRunning(){return this.enabled&&!this.paused&&this.timeScale!==0&&this._startTime===null&&this._mixer._isActiveAction(this)}isScheduled(){return this._mixer._isActiveAction(this)}startAt(e){return this._startTime=e,this}setLoop(e,t){return this.loop=e,this.repetitions=t,this}setEffectiveWeight(e){return this.weight=e,this._effectiveWeight=this.enabled?e:0,this.stopFading()}getEffectiveWeight(){return this._effectiveWeight}fadeIn(e){return this._scheduleFading(e,0,1)}fadeOut(e){return this._scheduleFading(e,1,0)}crossFadeFrom(e,t,n=!1){if(e.fadeOut(t),this.fadeIn(t),n===!0){let i=this._clip.duration,r=e._clip.duration,s=r/i,o=i/r;e._restoreTimeScale=e.timeScale,this._restoreTimeScale=this.timeScale,e.warp(1,s,t),this.warp(o,1,t)}return this}crossFadeTo(e,t,n=!1){return e.crossFadeFrom(this,t,n)}stopFading(){let e=this._weightInterpolant;if(e!==null)this._weightInterpolant=null,this._mixer._takeBackControlInterpolant(e);return this}setEffectiveTimeScale(e){return this.timeScale=e,this._effectiveTimeScale=this.paused?0:e,this.stopWarping()}getEffectiveTimeScale(){return this._effectiveTimeScale}setDuration(e){return this.timeScale=this._clip.duration/e,this.stopWarping()}syncWith(e){return this.time=e.time,this.timeScale=e.timeScale,this.stopWarping()}halt(e){return this.warp(this._effectiveTimeScale,0,e)}warp(e,t,n){let i=this._mixer,r=i.time,s=this.timeScale,o=this._timeScaleInterpolant;if(o===null)o=i._lendControlInterpolant(),this._timeScaleInterpolant=o;let a=o.parameterPositions,c=o.sampleValues;return a[0]=r,a[1]=r+n,c[0]=e/s,c[1]=t/s,this}stopWarping(){let e=this._timeScaleInterpolant;if(e!==null)this._timeScaleInterpolant=null,this._mixer._takeBackControlInterpolant(e);return this._restoreTimeScale=null,this}getMixer(){return this._mixer}getClip(){return this._clip}getRoot(){return this._localRoot||this._mixer._root}_update(e,t,n,i){if(!this.enabled){this._updateWeight(e);return}let r=this._startTime;if(r!==null){let a=(e-r)*n;if(a<0||n===0)t=0;else this._startTime=null,t=n*a}t*=this._updateTimeScale(e);let s=this._updateTime(t),o=this._updateWeight(e);if(o>0){let a=this._interpolants,c=this._propertyBindings;switch(this.blendMode){case 2501:for(let l=0,u=a.length;l!==u;++l)a[l].evaluate(s),c[l].accumulateAdditive(o);break;case 2500:default:for(let l=0,u=a.length;l!==u;++l)a[l].evaluate(s),c[l].accumulate(i,o)}}}_updateWeight(e){let t=0;if(this.enabled){t=this.weight;let n=this._weightInterpolant;if(n!==null){let i=n.evaluate(e)[0];if(t*=i,e>n.parameterPositions[1]){if(this.stopFading(),i===0)this.enabled=!1}}}return this._effectiveWeight=t,t}_updateTimeScale(e){let t=0;if(!this.paused){t=this.timeScale;let n=this._timeScaleInterpolant;if(n!==null){let i=n.evaluate(e)[0];if(t*=i,e>n.parameterPositions[1]){if(t===0)this.paused=!0;else{if(this._restoreTimeScale!==null)t=this._restoreTimeScale;this.timeScale=t}this.stopWarping()}}}return this._effectiveTimeScale=t,t}_updateTime(e){let t=this._clip.duration,n=this.loop,i=this.time+e,r=this._loopCount,s=n===2202;if(e===0){if(r===-1)return i;return s&&(r&1)===1?t-i:i}if(n===2200){if(r===-1)this._loopCount=0,this._setEndings(!0,!0,!1);e:{if(i>=t)i=t;else if(i<0)i=0;else{this.time=i;break e}if(this.clampWhenFinished)this.paused=!0;else this.enabled=!1;this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:e<0?-1:1})}}else{if(r===-1)if(e>=0)r=0,this._setEndings(!0,this.repetitions===0,s);else this._setEndings(this.repetitions===0,!0,s);if(i>=t||i<0){let o=Math.floor(i/t);i-=t*o,r+=Math.abs(o);let a=this.repetitions-r;if(a<=0){if(this.clampWhenFinished)this.paused=!0;else this.enabled=!1;i=e>0?t:0,this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:e>0?1:-1})}else{if(a===1){let c=e<0;this._setEndings(c,!c,s)}else this._setEndings(!1,!1,s);this._loopCount=r,this.time=i,this._mixer.dispatchEvent({type:"loop",action:this,loopDelta:o})}}else this._loopCount=r,this.time=i;if(s&&(r&1)===1)return t-i}return i}_setEndings(e,t,n){let i=this._interpolantSettings;if(n)i.endingStart=2401,i.endingEnd=2401;else{if(e)i.endingStart=this.zeroSlopeAtStart?2401:2400;else i.endingStart=2402;if(t)i.endingEnd=this.zeroSlopeAtEnd?2401:2400;else i.endingEnd=2402}}_scheduleFading(e,t,n){let i=this._mixer,r=i.time,s=this._weightInterpolant;if(s===null)s=i._lendControlInterpolant(),this._weightInterpolant=s;let o=s.parameterPositions,a=s.sampleValues;return o[0]=r,a[0]=t,o[1]=r+e,a[1]=n,this}}var uv=new Float32Array(1);class Sa extends kn{constructor(e){super();if(this._root=e,this._initMemoryManager(),this._accuIndex=0,this.time=0,this.timeScale=1,typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}_bindAction(e,t){let n=e._localRoot||this._root,i=e._clip.tracks,r=i.length,{_propertyBindings:s,_interpolants:o}=e,a=n.uuid,c=this._bindingsByRootAndName,l=c[a];if(l===void 0)l={},c[a]=l;for(let u=0;u!==r;++u){let d=i[u],h=d.name,f=l[h];if(f!==void 0)++f.referenceCount,s[u]=f;else{if(f=s[u],f!==void 0){if(f._cacheIndex===null)++f.referenceCount,this._addInactiveBinding(f,a,h);continue}let g=t&&t._propertyBindings[u].binding.parsedPath;f=new Kl(Qe.create(n,h,g),d.ValueTypeName,d.getValueSize()),++f.referenceCount,this._addInactiveBinding(f,a,h),s[u]=f}o[u].resultBuffer=f.buffer}}_activateAction(e){if(!this._isActiveAction(e)){if(e._cacheIndex===null){let n=(e._localRoot||this._root).uuid,i=e._clip.uuid,r=this._actionsByClip[i];this._bindAction(e,r&&r.knownActions[0]),this._addInactiveAction(e,i,n)}let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];if(r.useCount++===0)this._lendBinding(r),r.saveOriginalState()}this._lendAction(e)}}_deactivateAction(e){if(this._isActiveAction(e)){let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];if(--r.useCount===0)r.restoreOriginalState(),this._takeBackBinding(r)}this._takeBackAction(e)}}_initMemoryManager(){this._actions=[],this._nActiveActions=0,this._actionsByClip={},this._bindings=[],this._nActiveBindings=0,this._bindingsByRootAndName={},this._controlInterpolants=[],this._nActiveControlInterpolants=0;let e=this;this.stats={actions:{get total(){return e._actions.length},get inUse(){return e._nActiveActions}},bindings:{get total(){return e._bindings.length},get inUse(){return e._nActiveBindings}},controlInterpolants:{get total(){return e._controlInterpolants.length},get inUse(){return e._nActiveControlInterpolants}}}}_isActiveAction(e){let t=e._cacheIndex;return t!==null&&t<this._nActiveActions}_addInactiveAction(e,t,n){let i=this._actions,r=this._actionsByClip,s=r[t];if(s===void 0)s={knownActions:[e],actionByRoot:{}},e._byClipCacheIndex=0,r[t]=s;else{let o=s.knownActions;e._byClipCacheIndex=o.length,o.push(e)}e._cacheIndex=i.length,i.push(e),s.actionByRoot[n]=e}_removeInactiveAction(e){let t=this._actions,n=t[t.length-1],i=e._cacheIndex;n._cacheIndex=i,t[i]=n,t.pop(),e._cacheIndex=null;let r=e._clip.uuid,s=this._actionsByClip,o=s[r],a=o.knownActions,c=a[a.length-1],l=e._byClipCacheIndex;c._byClipCacheIndex=l,a[l]=c,a.pop(),e._byClipCacheIndex=null;let u=o.actionByRoot,d=(e._localRoot||this._root).uuid;if(delete u[d],a.length===0)delete s[r];this._removeInactiveBindingsForAction(e)}_removeInactiveBindingsForAction(e){let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];if(--r.referenceCount===0)this._removeInactiveBinding(r)}}_lendAction(e){let t=this._actions,n=e._cacheIndex,i=this._nActiveActions++,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_takeBackAction(e){let t=this._actions,n=e._cacheIndex,i=--this._nActiveActions,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_addInactiveBinding(e,t,n){let i=this._bindingsByRootAndName,r=this._bindings,s=i[t];if(s===void 0)s={},i[t]=s;s[n]=e,e._cacheIndex=r.length,r.push(e)}_removeInactiveBinding(e){let t=this._bindings,n=e.binding,i=n.rootNode.uuid,r=n.path,s=this._bindingsByRootAndName,o=s[i],a=t[t.length-1],c=e._cacheIndex;if(a._cacheIndex=c,t[c]=a,t.pop(),delete o[r],Object.keys(o).length===0)delete s[i]}_lendBinding(e){let t=this._bindings,n=e._cacheIndex,i=this._nActiveBindings++,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_takeBackBinding(e){let t=this._bindings,n=e._cacheIndex,i=--this._nActiveBindings,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_lendControlInterpolant(){let e=this._controlInterpolants,t=this._nActiveControlInterpolants++,n=e[t];if(n===void 0)n=new ma(new Float32Array(2),new Float32Array(2),1,uv),n.__cacheIndex=t,e[t]=n;return n}_takeBackControlInterpolant(e){let t=this._controlInterpolants,n=e.__cacheIndex,i=--this._nActiveControlInterpolants,r=t[i];e.__cacheIndex=i,t[i]=e,r.__cacheIndex=n,t[n]=r}clipAction(e,t,n){let i=t||this._root,r=i.uuid,s=typeof e==="string"?ri.findByName(i,e):e,o=s!==null?s.uuid:e,a=this._actionsByClip[o],c=null;if(n===void 0)if(s!==null)n=s.blendMode;else n=2500;if(a!==void 0){let u=a.actionByRoot[r];if(u!==void 0&&u.blendMode===n)return u;if(c=a.knownActions[0],s===null)s=c._clip}if(s===null)return null;let l=new eu(this,s,t,n);return this._bindAction(l,c),this._addInactiveAction(l,o,r),l}existingAction(e,t){let n=t||this._root,i=n.uuid,r=typeof e==="string"?ri.findByName(n,e):e,s=r?r.uuid:e,o=this._actionsByClip[s];if(o!==void 0)return o.actionByRoot[i]||null;return null}stopAllAction(){let e=this._actions,t=this._nActiveActions;for(let n=t-1;n>=0;--n)e[n].stop();return this}update(e){e*=this.timeScale;let t=this._actions,n=this._nActiveActions,i=this.time+=e,r=Math.sign(e),s=this._accuIndex^=1;for(let c=0;c!==n;++c)t[c]._update(i,e,r,s);let o=this._bindings,a=this._nActiveBindings;for(let c=0;c!==a;++c)o[c].apply(s);return this}setTime(e){this.time=0;for(let t=0;t<this._actions.length;t++)this._actions[t].time=0;return this.update(e)}getRoot(){return this._root}uncacheClip(e){let t=this._actions,n=e.uuid,i=this._actionsByClip,r=i[n];if(r!==void 0){let s=r.knownActions;for(let o=0,a=s.length;o!==a;++o){let c=s[o];this._deactivateAction(c);let l=c._cacheIndex,u=t[t.length-1];c._cacheIndex=null,c._byClipCacheIndex=null,u._cacheIndex=l,t[l]=u,t.pop(),this._removeInactiveBindingsForAction(c)}delete i[n]}}uncacheRoot(e){let t=e.uuid,n=this._actionsByClip;for(let s in n){let o=n[s].actionByRoot,a=o[t];if(a!==void 0)this._deactivateAction(a),this._removeInactiveAction(a)}let i=this._bindingsByRootAndName,r=i[t];if(r!==void 0)for(let s in r){let o=r[s];o.restoreOriginalState(),this._removeInactiveBinding(o)}}uncacheAction(e,t){let n=this.existingAction(e,t);if(n!==null)this._deactivateAction(n),this._removeInactiveAction(n)}}var lm=new Oe;class ba{constructor(e,t,n=0,i=1/0){this.ray=new ji(e,t),this.near=n,this.far=i,this.camera=null,this.layers=new Es,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){if(t.isPerspectiveCamera)this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,0.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t;else if(t.isOrthographicCamera)this.ray.origin.set(e.x,e.y,t.projectionMatrix.elements[14]).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t;else Ne("Raycaster: Unsupported camera type: "+t.type)}setFromXRController(e){return lm.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(lm),this}intersectObject(e,t=!0,n=[]){return Nc(e,this,n,t),n.sort(um),n}intersectObjects(e,t=!0,n=[]){for(let i=0,r=e.length;i<r;i++)Nc(e[i],this,n,t);return n.sort(um),n}}function um(e,t){return e.distance-t.distance}function Nc(e,t,n,i){let r=!0;if(e.layers.test(t.layers)){if(e.raycast(t,n)===!1)r=!1}if(r===!0&&i===!0){let s=e.children;for(let o=0,a=s.length;o<a;o++)Nc(s[o],t,n,!0)}}class tu{static{tu.prototype.isMatrix2=!0}constructor(e,t,n,i){if(this.elements=[1,0,0,1],e!==void 0)this.set(e,t,n,i)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,i){let r=this.elements;return r[0]=e,r[2]=t,r[1]=n,r[3]=i,this}}class Ma extends Ns{constructor(e=10,t=10,n=4473924,i=8947848){n=new Re(n),i=new Re(i);let r=t/2,s=e/t,o=e/2,a=[],c=[];for(let d=0,h=0,f=-o;d<=t;d++,f+=s){a.push(-o,0,f,o,0,f),a.push(f,0,-o,f,0,o);let g=d===r?n:i;g.toArray(c,h),h+=3,g.toArray(c,h),h+=3,g.toArray(c,h),h+=3,g.toArray(c,h),h+=3}let l=new Mt;l.setAttribute("position",new bt(a,3)),l.setAttribute("color",new bt(c,3));let u=new Ei({vertexColors:!0,toneMapped:!1});super(l,u);this.type="GridHelper"}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}function nu(e,t,n,i){let r=hv(i);switch(n){case 1021:return e*t;case 1028:return e*t/r.components*r.byteLength;case 1029:return e*t/r.components*r.byteLength;case 1030:return e*t*2/r.components*r.byteLength;case 1031:return e*t*2/r.components*r.byteLength;case 1022:return e*t*3/r.components*r.byteLength;case 1023:return e*t*4/r.components*r.byteLength;case 1033:return e*t*4/r.components*r.byteLength;case 33776:case 33777:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case 33778:case 33779:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 35841:case 35843:return Math.max(e,16)*Math.max(t,8)/4;case 35840:case 35842:return Math.max(e,8)*Math.max(t,8)/2;case 36196:case 37492:case 37488:case 37489:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case 37496:case 37490:case 37491:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 37808:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 37809:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case 37810:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case 37811:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case 37812:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case 37813:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case 37814:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case 37815:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case 37816:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case 37817:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case 37818:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case 37819:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case 37820:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case 37821:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case 36492:case 36494:case 36495:return Math.ceil(e/4)*Math.ceil(t/4)*16;case 36283:case 36284:return Math.ceil(e/4)*Math.ceil(t/4)*8;case 36285:case 36286:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw Error(`Unable to determine texture byte length for ${n} format.`)}function hv(e){switch(e){case 1009:case 1010:return{byteLength:1,components:1};case 1012:case 1011:case 1016:return{byteLength:2,components:1};case 1017:case 1018:return{byteLength:2,components:4};case 1014:case 1013:case 1015:return{byteLength:4,components:1};case 35902:case 35899:return{byteLength:4,components:3}}throw Error(`THREE.TextureUtils: Unknown texture type ${e}.`)}if(typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"186"}}));if(typeof window<"u")if(window.__THREE__)Te("WARNING: Multiple instances of Three.js being imported.");else window.__THREE__="186";function Bg(){let e=null,t=!1,n=null,i=null;function r(s,o){i=e.requestAnimationFrame(r),n(s,o)}return{start:function(){if(t===!0)return;if(n===null)return;if(e===null)return;i=e.requestAnimationFrame(r),t=!0},stop:function(){if(e!==null)e.cancelAnimationFrame(i);t=!1},setAnimationLoop:function(s){n=s},setContext:function(s){e=s}}}function dv(e){let t=new WeakMap;function n(a,c){let{array:l,usage:u}=a,d=l.byteLength,h=e.createBuffer();e.bindBuffer(c,h),e.bufferData(c,l,u),a.onUploadCallback();let f;if(l instanceof Float32Array)f=e.FLOAT;else if(typeof Float16Array<"u"&&l instanceof Float16Array)f=e.HALF_FLOAT;else if(l instanceof Uint16Array)if(a.isFloat16BufferAttribute)f=e.HALF_FLOAT;else f=e.UNSIGNED_SHORT;else if(l instanceof Int16Array)f=e.SHORT;else if(l instanceof Uint32Array)f=e.UNSIGNED_INT;else if(l instanceof Int32Array)f=e.INT;else if(l instanceof Int8Array)f=e.BYTE;else if(l instanceof Uint8Array)f=e.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)f=e.UNSIGNED_BYTE;else throw Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:h,type:f,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:d}}function i(a,c,l){let{array:u,updateRanges:d}=c;if(e.bindBuffer(l,a),d.length===0)e.bufferSubData(l,0,u);else{d.sort((f,g)=>f.start-g.start);let h=0;for(let f=1;f<d.length;f++){let g=d[h],S=d[f];if(S.start<=g.start+g.count+1)g.count=Math.max(g.count,S.start+S.count-g.start);else++h,d[h]=S}d.length=h+1;for(let f=0,g=d.length;f<g;f++){let S=d[f];e.bufferSubData(l,S.start*u.BYTES_PER_ELEMENT,u,S.start,S.count)}c.clearUpdateRanges()}c.onUploadCallback()}function r(a){if(a.isInterleavedBufferAttribute)a=a.data;return t.get(a)}function s(a){if(a.isInterleavedBufferAttribute)a=a.data;let c=t.get(a);if(c)e.deleteBuffer(c.buffer),t.delete(a)}function o(a,c){if(a.isInterleavedBufferAttribute)a=a.data;if(a.isGLBufferAttribute){let u=t.get(a);if(!u||u.version<a.version)t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let l=t.get(a);if(l===void 0)t.set(a,n(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(l.buffer,a,c),l.version=a.version}}return{get:r,remove:s,update:o}}var fv=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,pv=`#ifdef USE_ALPHAHASH
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
#endif`,mv=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,gv=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,_v=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,xv=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,vv=`#ifdef USE_AOMAP
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
#endif`,yv=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Sv=`#ifdef USE_BATCHING
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
#endif`,bv=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Mv=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,wv=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Tv=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,Ev=`#ifdef USE_IRIDESCENCE
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
#endif`,Av=`#ifdef USE_BUMPMAP
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
#endif`,Rv=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,Cv=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Iv=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Pv=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Lv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,Nv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Dv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Uv=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,Ov=`#define PI 3.141592653589793
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
} // validated`,Fv=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,zv=`vec3 transformedNormal = objectNormal;
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
#endif`,kv=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Bv=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Gv=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Hv=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Vv="gl_FragColor = linearToOutputTexel( gl_FragColor );",Wv=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,$v=`#ifdef USE_ENVMAP
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
#endif`,Zv=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Xv=`#ifdef USE_ENVMAP
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
#endif`,qv=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Yv=`#ifdef USE_ENVMAP
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
#endif`,Jv=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Kv=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,jv=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Qv=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,ey=`#ifdef USE_GRADIENTMAP
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
}`,ty=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,ny=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,iy=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,ry=`uniform bool receiveShadow;
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
#include <lightprobes_pars_fragment>`,sy=`#ifdef USE_ENVMAP
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
#endif`,oy=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,ay=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,cy=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,ly=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,uy=`PhysicalMaterial material;
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
#endif`,hy=`uniform sampler2D dfgLUT;
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
}`,dy=`
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
#endif`,fy=`#if defined( RE_IndirectDiffuse )
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
#endif`,py=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,my=`#ifdef USE_LIGHT_PROBES_GRID
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
#endif`,gy=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,_y=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,xy=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,vy=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,yy=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Sy=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,by=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,My=`#if defined( USE_POINTS_UV )
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
#endif`,wy=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Ty=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Ey=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Ay=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Ry=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Cy=`#ifdef USE_MORPHTARGETS
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
#endif`,Iy=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Py=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,Ly=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,Ny=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Dy=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Uy=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Oy=`#ifdef USE_NORMALMAP
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
#endif`,Fy=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,zy=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,ky=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,By=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Gy=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Hy=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,Vy=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Wy=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,$y=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Zy=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Xy=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,qy=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Yy=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Jy=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Ky=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,jy=`float getShadowMask() {
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
}`,Qy=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,eS=`#ifdef USE_SKINNING
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
#endif`,tS=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,nS=`#ifdef USE_SKINNING
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
#endif`,iS=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,rS=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,sS=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,oS=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,aS=`#ifdef USE_TRANSMISSION
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
#endif`,cS=`#ifdef USE_TRANSMISSION
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
#endif`,lS=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,uS=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,hS=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`;var dS=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,fS=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,pS=`uniform sampler2D t2D;
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
}`,mS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,gS=`#ifdef ENVMAP_TYPE_CUBE
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
}`,_S=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,xS=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,vS=`#include <common>
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
}`,yS=`#if DEPTH_PACKING == 3200
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
}`,SS=`#define DISTANCE
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
}`,bS=`#define DISTANCE
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
}`,MS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,wS=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,TS=`uniform float scale;
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
}`,ES=`uniform vec3 diffuse;
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
}`,AS=`#include <common>
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
}`,RS=`uniform vec3 diffuse;
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
}`,CS=`#define LAMBERT
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
}`,IS=`#define LAMBERT
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
}`,PS=`#define MATCAP
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
}`,LS=`#define MATCAP
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
}`,NS=`#define NORMAL
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
}`,DS=`#define NORMAL
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
}`,US=`#define PHONG
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
}`,OS=`#define PHONG
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
}`,FS=`#define STANDARD
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
}`,zS=`#define STANDARD
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
}`,kS=`#define TOON
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
}`,BS=`#define TOON
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
}`,GS=`uniform float size;
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
}`,HS=`uniform vec3 diffuse;
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
}`,VS=`#include <common>
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
}`,WS=`uniform vec3 color;
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
}`,$S=`uniform float rotation;
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
}`,ZS=`uniform vec3 diffuse;
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
}`,Ge={alphahash_fragment:fv,alphahash_pars_fragment:pv,alphamap_fragment:mv,alphamap_pars_fragment:gv,alphatest_fragment:_v,alphatest_pars_fragment:xv,aomap_fragment:vv,aomap_pars_fragment:yv,batching_pars_vertex:Sv,batching_vertex:bv,begin_vertex:Mv,beginnormal_vertex:wv,bsdfs:Tv,iridescence_fragment:Ev,bumpmap_pars_fragment:Av,clipping_planes_fragment:Rv,clipping_planes_pars_fragment:Cv,clipping_planes_pars_vertex:Iv,clipping_planes_vertex:Pv,color_fragment:Lv,color_pars_fragment:Nv,color_pars_vertex:Dv,color_vertex:Uv,common:Ov,cube_uv_reflection_fragment:Fv,defaultnormal_vertex:zv,displacementmap_pars_vertex:kv,displacementmap_vertex:Bv,emissivemap_fragment:Gv,emissivemap_pars_fragment:Hv,colorspace_fragment:Vv,colorspace_pars_fragment:Wv,envmap_fragment:$v,envmap_common_pars_fragment:Zv,envmap_pars_fragment:Xv,envmap_pars_vertex:qv,envmap_physical_pars_fragment:sy,envmap_vertex:Yv,fog_vertex:Jv,fog_pars_vertex:Kv,fog_fragment:jv,fog_pars_fragment:Qv,gradientmap_pars_fragment:ey,lightmap_pars_fragment:ty,lights_lambert_fragment:ny,lights_lambert_pars_fragment:iy,lights_pars_begin:ry,lights_toon_fragment:oy,lights_toon_pars_fragment:ay,lights_phong_fragment:cy,lights_phong_pars_fragment:ly,lights_physical_fragment:uy,lights_physical_pars_fragment:hy,lights_fragment_begin:dy,lights_fragment_maps:fy,lights_fragment_end:py,lightprobes_pars_fragment:my,logdepthbuf_fragment:gy,logdepthbuf_pars_fragment:_y,logdepthbuf_pars_vertex:xy,logdepthbuf_vertex:vy,map_fragment:yy,map_pars_fragment:Sy,map_particle_fragment:by,map_particle_pars_fragment:My,metalnessmap_fragment:wy,metalnessmap_pars_fragment:Ty,morphinstance_vertex:Ey,morphcolor_vertex:Ay,morphnormal_vertex:Ry,morphtarget_pars_vertex:Cy,morphtarget_vertex:Iy,normal_fragment_begin:Py,normal_fragment_maps:Ly,normal_pars_fragment:Ny,normal_pars_vertex:Dy,normal_vertex:Uy,normalmap_pars_fragment:Oy,clearcoat_normal_fragment_begin:Fy,clearcoat_normal_fragment_maps:zy,clearcoat_pars_fragment:ky,iridescence_pars_fragment:By,opaque_fragment:Gy,packing:Hy,premultiplied_alpha_fragment:Vy,project_vertex:Wy,dithering_fragment:$y,dithering_pars_fragment:Zy,roughnessmap_fragment:Xy,roughnessmap_pars_fragment:qy,shadowmap_pars_fragment:Yy,shadowmap_pars_vertex:Jy,shadowmap_vertex:Ky,shadowmask_pars_fragment:jy,skinbase_vertex:Qy,skinning_pars_vertex:eS,skinning_vertex:tS,skinnormal_vertex:nS,specularmap_fragment:iS,specularmap_pars_fragment:rS,tonemapping_fragment:sS,tonemapping_pars_fragment:oS,transmission_fragment:aS,transmission_pars_fragment:cS,uv_pars_fragment:lS,uv_pars_vertex:uS,uv_vertex:hS,worldpos_vertex:dS,background_vert:fS,background_frag:pS,backgroundCube_vert:mS,backgroundCube_frag:gS,cube_vert:_S,cube_frag:xS,depth_vert:vS,depth_frag:yS,distance_vert:SS,distance_frag:bS,equirect_vert:MS,equirect_frag:wS,linedashed_vert:TS,linedashed_frag:ES,meshbasic_vert:AS,meshbasic_frag:RS,meshlambert_vert:CS,meshlambert_frag:IS,meshmatcap_vert:PS,meshmatcap_frag:LS,meshnormal_vert:NS,meshnormal_frag:DS,meshphong_vert:US,meshphong_frag:OS,meshphysical_vert:FS,meshphysical_frag:zS,meshtoon_vert:kS,meshtoon_frag:BS,points_vert:GS,points_frag:HS,shadow_vert:VS,shadow_frag:WS,sprite_vert:$S,sprite_frag:ZS},de={common:{diffuse:{value:new Re(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Fe},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Fe}},envmap:{envMap:{value:null},envMapRotation:{value:new Fe},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:0.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Fe}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Fe}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Fe},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Fe},normalScale:{value:new Ue(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Fe},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Fe}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Fe}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Fe}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:0.00025},fogNear:{value:1},fogFar:{value:2000},fogColor:{value:new Re(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new U},probesMax:{value:new U},probesResolution:{value:new U}},points:{diffuse:{value:new Re(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0},uvTransform:{value:new Fe}},sprite:{diffuse:{value:new Re(16777215)},opacity:{value:1},center:{value:new Ue(0.5,0.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Fe},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0}}},Wn={basic:{uniforms:$t([de.common,de.specularmap,de.envmap,de.aomap,de.lightmap,de.fog]),vertexShader:Ge.meshbasic_vert,fragmentShader:Ge.meshbasic_frag},lambert:{uniforms:$t([de.common,de.specularmap,de.envmap,de.aomap,de.lightmap,de.emissivemap,de.bumpmap,de.normalmap,de.displacementmap,de.fog,de.lights,{emissive:{value:new Re(0)},envMapIntensity:{value:1}}]),vertexShader:Ge.meshlambert_vert,fragmentShader:Ge.meshlambert_frag},phong:{uniforms:$t([de.common,de.specularmap,de.envmap,de.aomap,de.lightmap,de.emissivemap,de.bumpmap,de.normalmap,de.displacementmap,de.fog,de.lights,{emissive:{value:new Re(0)},specular:{value:new Re(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ge.meshphong_vert,fragmentShader:Ge.meshphong_frag},standard:{uniforms:$t([de.common,de.envmap,de.aomap,de.lightmap,de.emissivemap,de.bumpmap,de.normalmap,de.displacementmap,de.roughnessmap,de.metalnessmap,de.fog,de.lights,{emissive:{value:new Re(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ge.meshphysical_vert,fragmentShader:Ge.meshphysical_frag},toon:{uniforms:$t([de.common,de.aomap,de.lightmap,de.emissivemap,de.bumpmap,de.normalmap,de.displacementmap,de.gradientmap,de.fog,de.lights,{emissive:{value:new Re(0)}}]),vertexShader:Ge.meshtoon_vert,fragmentShader:Ge.meshtoon_frag},matcap:{uniforms:$t([de.common,de.bumpmap,de.normalmap,de.displacementmap,de.fog,{matcap:{value:null}}]),vertexShader:Ge.meshmatcap_vert,fragmentShader:Ge.meshmatcap_frag},points:{uniforms:$t([de.points,de.fog]),vertexShader:Ge.points_vert,fragmentShader:Ge.points_frag},dashed:{uniforms:$t([de.common,de.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ge.linedashed_vert,fragmentShader:Ge.linedashed_frag},depth:{uniforms:$t([de.common,de.displacementmap]),vertexShader:Ge.depth_vert,fragmentShader:Ge.depth_frag},normal:{uniforms:$t([de.common,de.bumpmap,de.normalmap,de.displacementmap,{opacity:{value:1}}]),vertexShader:Ge.meshnormal_vert,fragmentShader:Ge.meshnormal_frag},sprite:{uniforms:$t([de.sprite,de.fog]),vertexShader:Ge.sprite_vert,fragmentShader:Ge.sprite_frag},background:{uniforms:{uvTransform:{value:new Fe},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ge.background_vert,fragmentShader:Ge.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Fe}},vertexShader:Ge.backgroundCube_vert,fragmentShader:Ge.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ge.cube_vert,fragmentShader:Ge.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ge.equirect_vert,fragmentShader:Ge.equirect_frag},distance:{uniforms:$t([de.common,de.displacementmap,{referencePosition:{value:new U},nearDistance:{value:1},farDistance:{value:1000}}]),vertexShader:Ge.distance_vert,fragmentShader:Ge.distance_frag},shadow:{uniforms:$t([de.lights,de.fog,{color:{value:new Re(0)},opacity:{value:1}}]),vertexShader:Ge.shadow_vert,fragmentShader:Ge.shadow_frag}};Wn.physical={uniforms:$t([Wn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Fe},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Fe},clearcoatNormalScale:{value:new Ue(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Fe},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Fe},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Fe},sheen:{value:0},sheenColor:{value:new Re(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Fe},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Fe},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Fe},transmissionSamplerSize:{value:new Ue},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Fe},attenuationDistance:{value:0},attenuationColor:{value:new Re(0)},specularColor:{value:new Re(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Fe},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Fe},anisotropyVector:{value:new Ue},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Fe}}]),vertexShader:Ge.meshphysical_vert,fragmentShader:Ge.meshphysical_frag};var wa={r:0,b:0,g:0},XS=new Oe,Gg=new Fe;Gg.set(-1,0,0,0,1,0,0,0,1);function qS(e,t,n,i,r,s){let o=new Re(0),a=r===!0?0:1,c,l,u=null,d=0,h=null;function f(T){let A=T.isScene===!0?T.background:null;if(A&&A.isTexture){let v=T.backgroundBlurriness>0;A=t.get(A,v)}return A}function g(T){let A=!1,v=f(T);if(v===null)p(o,a);else if(v&&v.isColor)p(v,1),A=!0;let w=e.xr.getEnvironmentBlendMode();if(w==="additive")n.buffers.color.setClear(0,0,0,1,s);else if(w==="alpha-blend")n.buffers.color.setClear(0,0,0,0,s);if(e.autoClear||A)n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil)}function S(T,A){let v=f(A);if(v&&(v.isCubeTexture||v.mapping===bs)){if(l===void 0)l=new xt(new Ri(1,1,1),new en({name:"BackgroundCubeMaterial",uniforms:tr(Wn.backgroundCube.uniforms),vertexShader:Wn.backgroundCube.vertexShader,fragmentShader:Wn.backgroundCube.fragmentShader,side:jt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),l.geometry.deleteAttribute("uv"),l.onBeforeRender=function(w,E,R){this.matrixWorld.copyPosition(R.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(l);if(l.material.uniforms.envMap.value=v,l.material.uniforms.backgroundBlurriness.value=A.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=A.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(XS.makeRotationFromEuler(A.backgroundRotation)).transpose(),v.isCubeTexture&&v.isRenderTargetTexture===!1)l.material.uniforms.backgroundRotation.value.premultiply(Gg);if(l.material.toneMapped=He.getTransfer(v.colorSpace)!==ut,u!==v||d!==v.version||h!==e.toneMapping)l.material.needsUpdate=!0,u=v,d=v.version,h=e.toneMapping;l.layers.enableAll(),T.unshift(l,l.geometry,l.material,0,0,null)}else if(v&&v.isTexture){if(c===void 0)c=new xt(new Us(2,2),new en({name:"BackgroundMaterial",uniforms:tr(Wn.background.uniforms),vertexShader:Wn.background.vertexShader,fragmentShader:Wn.background.fragmentShader,side:Mi,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(c);if(c.material.uniforms.t2D.value=v,c.material.uniforms.backgroundIntensity.value=A.backgroundIntensity,c.material.toneMapped=He.getTransfer(v.colorSpace)!==ut,v.matrixAutoUpdate===!0)v.updateMatrix();if(c.material.uniforms.uvTransform.value.copy(v.matrix),u!==v||d!==v.version||h!==e.toneMapping)c.material.needsUpdate=!0,u=v,d=v.version,h=e.toneMapping;c.layers.enableAll(),T.unshift(c,c.geometry,c.material,0,0,null)}}function p(T,A){T.getRGB(wa,Gl(e)),n.buffers.color.setClear(wa.r,wa.g,wa.b,A,s)}function m(){if(l!==void 0)l.geometry.dispose(),l.material.dispose(),l=void 0;if(c!==void 0)c.geometry.dispose(),c.material.dispose(),c=void 0}return{getClearColor:function(){return o},setClearColor:function(T,A=1){o.set(T),a=A,p(o,a)},getClearAlpha:function(){return a},setClearAlpha:function(T){a=T,p(o,a)},render:g,addToRenderList:S,dispose:m}}function YS(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),i={},r=h(null),s=r,o=!1;function a(O,z,D,C,F){let Z=!1,G=d(O,C,D,z);if(s!==G)s=G,l(s.object);if(Z=f(O,C,D,F),Z)g(O,C,D,F);if(F!==null)t.update(F,e.ELEMENT_ARRAY_BUFFER);if(Z||o){if(o=!1,v(O,z,D,C),F!==null)e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(F).buffer)}}function c(){return e.createVertexArray()}function l(O){return e.bindVertexArray(O)}function u(O){return e.deleteVertexArray(O)}function d(O,z,D,C){let F=C.wireframe===!0,Z=i[z.id];if(Z===void 0)Z={},i[z.id]=Z;let G=O.isInstancedMesh===!0?O.id:0,ie=Z[G];if(ie===void 0)ie={},Z[G]=ie;let X=ie[D.id];if(X===void 0)X={},ie[D.id]=X;let Q=X[F];if(Q===void 0)Q=h(c()),X[F]=Q;return Q}function h(O){let z=[],D=[],C=[];for(let F=0;F<n;F++)z[F]=0,D[F]=0,C[F]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:z,enabledAttributes:D,attributeDivisors:C,object:O,attributes:{},index:null}}function f(O,z,D,C){let F=s.attributes,Z=z.attributes,G=0,ie=D.getAttributes();for(let X in ie)if(ie[X].location>=0){let ee=F[X],ve=Z[X];if(ve===void 0){if(X==="instanceMatrix"&&O.instanceMatrix)ve=O.instanceMatrix;if(X==="instanceColor"&&O.instanceColor)ve=O.instanceColor}if(ee===void 0)return!0;if(ee.attribute!==ve)return!0;if(ve&&ee.data!==ve.data)return!0;G++}if(s.attributesNum!==G)return!0;if(s.index!==C)return!0;return!1}function g(O,z,D,C){let F={},Z=z.attributes,G=0,ie=D.getAttributes();for(let X in ie)if(ie[X].location>=0){let ee=Z[X];if(ee===void 0){if(X==="instanceMatrix"&&O.instanceMatrix)ee=O.instanceMatrix;if(X==="instanceColor"&&O.instanceColor)ee=O.instanceColor}let ve={};if(ve.attribute=ee,ee&&ee.data)ve.data=ee.data;F[X]=ve,G++}s.attributes=F,s.attributesNum=G,s.index=C}function S(){let O=s.newAttributes;for(let z=0,D=O.length;z<D;z++)O[z]=0}function p(O){m(O,0)}function m(O,z){let D=s.newAttributes,C=s.enabledAttributes,F=s.attributeDivisors;if(D[O]=1,C[O]===0)e.enableVertexAttribArray(O),C[O]=1;if(F[O]!==z)e.vertexAttribDivisor(O,z),F[O]=z}function T(){let O=s.newAttributes,z=s.enabledAttributes;for(let D=0,C=z.length;D<C;D++)if(z[D]!==O[D])e.disableVertexAttribArray(D),z[D]=0}function A(O,z,D,C,F,Z,G){if(G===!0)e.vertexAttribIPointer(O,z,D,F,Z);else e.vertexAttribPointer(O,z,D,C,F,Z)}function v(O,z,D,C){S();let F=C.attributes,Z=D.getAttributes(),G=z.defaultAttributeValues;for(let ie in Z){let X=Z[ie];if(X.location>=0){let Q=F[ie];if(Q===void 0){if(ie==="instanceMatrix"&&O.instanceMatrix)Q=O.instanceMatrix;if(ie==="instanceColor"&&O.instanceColor)Q=O.instanceColor}if(Q!==void 0){let ee=Q.normalized,ve=Q.itemSize,Ee=t.get(Q);if(Ee===void 0)continue;let{buffer:qe,type:ke,bytesPerElement:q}=Ee,re=ke===e.INT||ke===e.UNSIGNED_INT||Q.gpuType===Zc;if(Q.isInterleavedBufferAttribute){let se=Q.data,Pe=se.stride,De=Q.offset;if(se.isInstancedInterleavedBuffer){for(let Ce=0;Ce<X.locationSize;Ce++)m(X.location+Ce,se.meshPerAttribute);if(O.isInstancedMesh!==!0&&C._maxInstanceCount===void 0)C._maxInstanceCount=se.meshPerAttribute*se.count}else for(let Ce=0;Ce<X.locationSize;Ce++)p(X.location+Ce);e.bindBuffer(e.ARRAY_BUFFER,qe);for(let Ce=0;Ce<X.locationSize;Ce++)A(X.location+Ce,ve/X.locationSize,ke,ee,Pe*q,(De+ve/X.locationSize*Ce)*q,re)}else{if(Q.isInstancedBufferAttribute){for(let se=0;se<X.locationSize;se++)m(X.location+se,Q.meshPerAttribute);if(O.isInstancedMesh!==!0&&C._maxInstanceCount===void 0)C._maxInstanceCount=Q.meshPerAttribute*Q.count}else for(let se=0;se<X.locationSize;se++)p(X.location+se);e.bindBuffer(e.ARRAY_BUFFER,qe);for(let se=0;se<X.locationSize;se++)A(X.location+se,ve/X.locationSize,ke,ee,ve*q,ve/X.locationSize*se*q,re)}}else if(G!==void 0){let ee=G[ie];if(ee!==void 0)switch(ee.length){case 2:e.vertexAttrib2fv(X.location,ee);break;case 3:e.vertexAttrib3fv(X.location,ee);break;case 4:e.vertexAttrib4fv(X.location,ee);break;default:e.vertexAttrib1fv(X.location,ee)}}}}T()}function w(){M();for(let O in i){let z=i[O];for(let D in z){let C=z[D];for(let F in C){let Z=C[F];for(let G in Z)u(Z[G].object),delete Z[G];delete C[F]}}delete i[O]}}function E(O){if(i[O.id]===void 0)return;let z=i[O.id];for(let D in z){let C=z[D];for(let F in C){let Z=C[F];for(let G in Z)u(Z[G].object),delete Z[G];delete C[F]}}delete i[O.id]}function R(O){for(let z in i){let D=i[z];for(let C in D){let F=D[C];if(F[O.id]===void 0)continue;let Z=F[O.id];for(let G in Z)u(Z[G].object),delete Z[G];delete F[O.id]}}}function x(O){for(let z in i){let D=i[z],C=O.isInstancedMesh===!0?O.id:0,F=D[C];if(F===void 0)continue;for(let Z in F){let G=F[Z];for(let ie in G)u(G[ie].object),delete G[ie];delete F[Z]}if(delete D[C],Object.keys(D).length===0)delete i[z]}}function M(){if(H(),o=!0,s===r)return;s=r,l(s.object)}function H(){r.geometry=null,r.program=null,r.wireframe=!1}return{setup:a,reset:M,resetDefaultState:H,dispose:w,releaseStatesOfGeometry:E,releaseStatesOfObject:x,releaseStatesOfProgram:R,initAttributes:S,enableAttribute:p,disableUnusedAttributes:T}}function JS(e,t,n){let i;function r(c){i=c}function s(c,l){e.drawArrays(i,c,l),n.update(l,i,1)}function o(c,l,u){if(u===0)return;e.drawArraysInstanced(i,c,l,u),n.update(l,i,u)}function a(c,l,u){if(u===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,c,0,l,0,u);let h=0;for(let f=0;f<u;f++)h+=l[f];n.update(h,i,1)}this.setMode=r,this.render=s,this.renderInstances=o,this.renderMultiDraw=a}function KS(e,t,n,i){let r;function s(){if(r!==void 0)return r;if(t.has("EXT_texture_filter_anisotropic")===!0){let R=t.get("EXT_texture_filter_anisotropic");r=e.getParameter(R.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else r=0;return r}function o(R){if(R!==zn&&i.convert(R)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT))return!1;return!0}function a(R){let x=R===Fn&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));if(R!==En&&R!==si&&!x&&i.convert(R)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE))return!1;return!0}function c(R){if(R==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";R="mediump"}if(R==="mediump"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0)return"mediump"}return"lowp"}let l=n.precision!==void 0?n.precision:"highp",u=c(l);if(u!==l)Te("WebGLRenderer:",l,"not supported, using",u,"instead."),l=u;let d=n.logarithmicDepthBuffer===!0,h=n.reversedDepthBuffer===!0&&t.has("EXT_clip_control");if(n.reversedDepthBuffer===!0&&h===!1)Te("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");let f=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),g=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),S=e.getParameter(e.MAX_TEXTURE_SIZE),p=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),m=e.getParameter(e.MAX_VERTEX_ATTRIBS),T=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),A=e.getParameter(e.MAX_VARYING_VECTORS),v=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),w=e.getParameter(e.MAX_SAMPLES),E=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:h,maxTextures:f,maxVertexTextures:g,maxTextureSize:S,maxCubemapSize:p,maxAttributes:m,maxVertexUniforms:T,maxVaryings:A,maxFragmentUniforms:v,maxSamples:w,samples:E}}function jS(e){let t=this,n=null,i=0,r=!1,s=!1,o=new pn,a=new Fe,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(d,h){let f=d.length!==0||h||i!==0||r;return r=h,i=d.length,f},this.beginShadows=function(){s=!0,u(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(d,h){n=u(d,h,0)},this.setState=function(d,h,f){let{clippingPlanes:g,clipIntersection:S,clipShadows:p}=d,m=e.get(d);if(!r||g===null||g.length===0||s&&!p)if(s)u(null);else l();else{let T=s?0:i,A=T*4,v=m.clippingState||null;c.value=v,v=u(g,h,A,f);for(let w=0;w!==A;++w)v[w]=n[w];m.clippingState=v,this.numIntersection=S?this.numPlanes:0,this.numPlanes+=T}};function l(){if(c.value!==n)c.value=n,c.needsUpdate=i>0;t.numPlanes=i,t.numIntersection=0}function u(d,h,f,g){let S=d!==null?d.length:0,p=null;if(S!==0){if(p=c.value,g!==!0||p===null){let m=f+S*4,T=h.matrixWorldInverse;if(a.getNormalMatrix(T),p===null||p.length<m)p=new Float32Array(m);for(let A=0,v=f;A!==S;++A,v+=4)o.copy(d[A]).applyMatrix4(T,a),o.normal.toArray(p,v),p[v+3]=o.constant}c.value=p,c.needsUpdate=!0}return t.numPlanes=S,t.numIntersection=0,p}}var Xr=4,QS=6,eb=20,tb=256,Gs=new nr,vg=new Re,iu=null,ru=0,su=0,ou=!1,nb=new U,rr=new U;class lu{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=0.1,i=100,r={}){let{size:s=256,position:o=nb}=r;iu=this._renderer.getRenderTarget(),ru=this._renderer.getActiveCubeFace(),su=this._renderer.getActiveMipmapLevel(),ou=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(s);let a=this._allocateTargets();if(a.depthBuffer=!0,this._sceneToCubeUV(e,n,i,a,o),t>0)this._blur(a,0,0,t);return this._applyPMREM(a),this._cleanup(a),a}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){if(this._cubemapMaterial===null)this._cubemapMaterial=bg(),this._compileMaterial(this._cubemapMaterial)}compileEquirectangularShader(){if(this._equirectMaterial===null)this._equirectMaterial=Sg(),this._compileMaterial(this._equirectMaterial)}dispose(){if(this._dispose(),this._cubemapMaterial!==null)this._cubemapMaterial.dispose();if(this._equirectMaterial!==null)this._equirectMaterial.dispose();if(this._backgroundBox!==null)this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){if(this._blurMaterial!==null)this._blurMaterial.dispose();if(this._ggxMaterial!==null)this._ggxMaterial.dispose();if(this._pingPongRenderTarget!==null)this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(iu,ru,su),this._renderer.xr.enabled=ou,e.scissorTest=!1,Zr(e,0,0,e.width,e.height)}_fromTexture(e,t){if(e.mapping===Ur||e.mapping===Zi)this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width);else this._setSize(e.image.width/4);iu=this._renderer.getRenderTarget(),ru=this._renderer.getActiveCubeFace(),su=this._renderer.getActiveMipmapLevel(),ou=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:zt,minFilter:zt,generateMipmaps:!1,type:Fn,format:zn,colorSpace:on,depthBuffer:!1},i=yg(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){if(this._pingPongRenderTarget!==null)this._dispose();this._pingPongRenderTarget=yg(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=ib(r)),this._blurMaterial=sb(r,e,t),this._ggxMaterial=rb(r,e,t)}return i}_compileMaterial(e){let t=new xt(new Mt,e);this._renderer.compile(t,Gs)}_sceneToCubeUV(e,t,n,i,r){let a=new Lt(90,1,t,n),c=[1,-1,1,1,1,1],l=[1,1,1,-1,-1,-1],u=this._renderer,{autoClear:d,toneMapping:h}=u;if(u.getClearColor(vg),u.toneMapping=wn,u.autoClear=!1,u.state.buffers.depth.getReversed())u.setRenderTarget(i),u.clearDepth(),u.setRenderTarget(null);if(this._backgroundBox===null)this._backgroundBox=new xt(new Ri,new Bn({name:"PMREM.Background",side:jt,depthWrite:!1,depthTest:!1}));let g=this._backgroundBox,S=g.material,p=!1,m=e.background;if(m){if(m.isColor)S.color.copy(m),e.background=null,p=!0}else S.color.copy(vg),p=!0;for(let T=0;T<6;T++){let A=T%3;if(A===0)a.up.set(0,c[T],0),a.position.set(r.x,r.y,r.z),a.lookAt(r.x+l[T],r.y,r.z);else if(A===1)a.up.set(0,0,c[T]),a.position.set(r.x,r.y,r.z),a.lookAt(r.x,r.y+l[T],r.z);else a.up.set(0,c[T],0),a.position.set(r.x,r.y,r.z),a.lookAt(r.x,r.y,r.z+l[T]);let v=this._cubeSize;if(Zr(i,A*v,T>2?v:0,v,v),u.setRenderTarget(i),p)u.render(g,a);u.render(e,a)}u.toneMapping=h,u.autoClear=d,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,i=e.mapping===Ur||e.mapping===Zi;if(i){if(this._cubemapMaterial===null)this._cubemapMaterial=bg();this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1}else if(this._equirectMaterial===null)this._equirectMaterial=Sg();let r=i?this._cubemapMaterial:this._equirectMaterial,s=this._lodMeshes[0];s.material=r;let o=r.uniforms;o.envMap.value=e;let a=this._cubeSize;Zr(t,0,0,3*a,2*a),n.setRenderTarget(t),n.render(s,Gs)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let i=this._lodMeshes.length;for(let r=1;r<i;r++)this._applyGGXFilter(e,r-1,r);t.autoClear=n}_applyGGXFilter(e,t,n){let i=this._renderer,r=this._pingPongRenderTarget,s=this._ggxMaterial,o=this._lodMeshes[n];o.material=s;let a=s.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l),d=c*1.25,h=u*d,{_lodMax:f}=this,g=this._sizeLods[n],S=3*g*(n>f-Xr?n-f+Xr:0),p=4*(this._cubeSize-g);a.envMap.value=e.texture,a.roughness.value=h,a.mipInt.value=f-t,Zr(r,S,p,3*g,2*g),i.setRenderTarget(r),i.render(o,Gs),a.envMap.value=r.texture,a.roughness.value=0,a.mipInt.value=f-n,Zr(e,S,p,3*g,2*g),i.setRenderTarget(e),i.render(o,Gs)}_blur(e,t,n,i){let r=this._pingPongRenderTarget,s=Math.min(i,Math.PI)/Math.SQRT2;this._blurPass(e,r,t,n,s),this._blurPass(r,e,n,n,s)}_blurPass(e,t,n,i,r){let s=this._renderer,o=this._blurMaterial,a=this._lodMeshes[i];a.material=o;let c=o.uniforms;c.envMap.value=e.texture,c.sigma.value=r,c.mipInt.value=this._lodMax-n;let l=this._sizeLods[i],u=3*l*(i>this._lodMax-Xr?i-this._lodMax+Xr:0),d=4*(this._cubeSize-l);Zr(t,u,d,3*l,2*l),s.setRenderTarget(t),s.render(a,Gs)}}function ib(e){let t=[],n=[],i=e,r=e-Xr+1+QS;for(let s=0;s<r;s++){let o=Math.pow(2,i);t.push(o);let a=1/(o-2),c=-a,l=1+a,u=[c,c,l,c,l,l,c,c,l,l,c,l],d=6,h=6,f=3,g=new Float32Array(f*h*d),S=new Float32Array(f*h*d);for(let m=0;m<d;m++){let T=m%3*2/3-1,A=m>2?0:-1,v=[T,A,0,T+0.6666666666666666,A,0,T+0.6666666666666666,A+1,0,T,A,0,T+0.6666666666666666,A+1,0,T,A+1,0];g.set(v,f*h*m);for(let w=0;w<h;w++){let E=u[w*2]*2-1,R=u[w*2+1]*2-1;if(m===0)rr.set(1,R,E);else if(m===1)rr.set(-E,1,-R);else if(m===2)rr.set(-E,R,1);else if(m===3)rr.set(-1,R,-E);else if(m===4)rr.set(-E,-1,R);else rr.set(E,R,-1);rr.toArray(S,(m*h+w)*f)}}let p=new Mt;if(p.setAttribute("position",new Ft(g,f)),p.setAttribute("outputDirection",new Ft(S,f)),n.push(new xt(p,null)),i>Xr)i--}return{lodMeshes:n,sizeLods:t}}function yg(e,t,n){let i=new an(e,t,n);return i.texture.mapping=bs,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function Zr(e,t,n,i,r){e.viewport.set(t,n,i,r),e.scissor.set(t,n,i,r)}function rb(e,t,n){return new en({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:tb,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Ea(),fragmentShader:`

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
		`,blending:Un,depthTest:!1,depthWrite:!1})}function sb(e,t,n){return new en({name:"SphericalGaussianBlur",defines:{SAMPLES:eb,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:Ea(),fragmentShader:`

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
		`,blending:Un,depthTest:!1,depthWrite:!1})}function Sg(){return new en({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Ea(),fragmentShader:`

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
		`,blending:Un,depthTest:!1,depthWrite:!1})}function bg(){return new en({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Ea(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Un,depthTest:!1,depthWrite:!1})}function Ea(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}class du extends an{constructor(e=1,t={}){super(e,e,t);this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},i=[n,n,n,n,n,n];this.texture=new fa(i),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},i=new Ri(5,5,5),r=new en({name:"CubemapFromEquirect",uniforms:tr(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:jt,blending:Un});r.uniforms.tEquirect.value=t;let s=new xt(i,r),o=t.minFilter;if(t.minFilter===On)t.minFilter=zt;return new Yl(1,10,this).update(e,s),t.minFilter=o,s.geometry.dispose(),s.material.dispose(),this}clear(e,t=!0,n=!0,i=!0){let r=e.getRenderTarget();for(let s=0;s<6;s++)e.setRenderTarget(this,s),e.clear(t,n,i);e.setRenderTarget(r)}}function ob(e){let t=new WeakMap,n=new WeakMap,i=null;function r(h,f=!1){if(h===null||h===void 0)return null;if(f)return o(h);return s(h)}function s(h){if(h&&h.isTexture){let f=h.mapping;if(f===qo||f===Yo)if(t.has(h)){let g=t.get(h).texture;return a(g,h.mapping)}else{let g=h.image;if(g&&g.height>0){let S=new du(g.height);return S.fromEquirectangularTexture(e,h),t.set(h,S),h.addEventListener("dispose",l),a(S.texture,h.mapping)}else return null}}return h}function o(h){if(h&&h.isTexture){let f=h.mapping,g=f===qo||f===Yo,S=f===Ur||f===Zi;if(g||S){let p=n.get(h),m=p!==void 0?p.texture.pmremVersion:0;if(h.isRenderTargetTexture&&h.pmremVersion!==m){if(i===null)i=new lu(e);return p=g?i.fromEquirectangular(h,p):i.fromCubemap(h,p),p.texture.pmremVersion=h.pmremVersion,n.set(h,p),p.texture}else if(p!==void 0)return p.texture;else{let T=h.image;if(g&&T&&T.height>0||S&&T&&c(T)){if(i===null)i=new lu(e);return p=g?i.fromEquirectangular(h):i.fromCubemap(h),p.texture.pmremVersion=h.pmremVersion,n.set(h,p),h.addEventListener("dispose",u),p.texture}else return null}}}return h}function a(h,f){if(f===qo)h.mapping=Ur;else if(f===Yo)h.mapping=Zi;return h}function c(h){let f=0,g=6;for(let S=0;S<g;S++)if(h[S]!==void 0)f++;return f===g}function l(h){let f=h.target;f.removeEventListener("dispose",l);let g=t.get(f);if(g!==void 0)t.delete(f),g.dispose()}function u(h){let f=h.target;f.removeEventListener("dispose",u);let g=n.get(f);if(g!==void 0)n.delete(f),g.dispose()}function d(){if(t=new WeakMap,n=new WeakMap,i!==null)i.dispose(),i=null}return{get:r,dispose:d}}function ab(e){let t={};function n(i){if(t[i]!==void 0)return t[i];let r=e.getExtension(i);return t[i]=r,r}return{has:function(i){return n(i)!==null},init:function(){n("EXT_color_buffer_float"),n("WEBGL_clip_cull_distance"),n("OES_texture_float_linear"),n("EXT_color_buffer_half_float"),n("WEBGL_multisampled_render_to_texture"),n("WEBGL_render_shared_exponent")},get:function(i){let r=n(i);if(r===null)Wi("WebGLRenderer: "+i+" extension not supported.");return r}}}function cb(e,t,n,i){let r={},s=new WeakMap;function o(d){let h=d.target;if(h.index!==null)t.remove(h.index);for(let g in h.attributes)t.remove(h.attributes[g]);h.removeEventListener("dispose",o),delete r[h.id];let f=s.get(h);if(f)t.remove(f),s.delete(h);if(i.releaseStatesOfGeometry(h),h.isInstancedBufferGeometry===!0)delete h._maxInstanceCount;n.memory.geometries--}function a(d,h){if(r[h.id]===!0)return h;return h.addEventListener("dispose",o),r[h.id]=!0,n.memory.geometries++,h}function c(d){let h=d.attributes;for(let f in h)t.update(h[f],e.ARRAY_BUFFER)}function l(d){let h=[],f=d.index,g=d.attributes.position,S=0;if(g===void 0)return;if(f!==null){let T=f.array;S=f.version;for(let A=0,v=T.length;A<v;A+=3){let w=T[A+0],E=T[A+1],R=T[A+2];h.push(w,E,E,R,R,w)}}else{let T=g.array;S=g.version;for(let A=0,v=T.length/3-1;A<v;A+=3){let w=A+0,E=A+1,R=A+2;h.push(w,E,E,R,R,w)}}let p=new(g.count>=65535?la:ca)(h,1);p.version=S;let m=s.get(d);if(m)t.remove(m);s.set(d,p)}function u(d){let h=s.get(d);if(h){let f=d.index;if(f!==null){if(h.version<f.version)l(d)}}else l(d);return s.get(d)}return{get:a,update:c,getWireframeAttribute:u}}function lb(e,t,n){let i;function r(d){i=d}let s,o;function a(d){s=d.type,o=d.bytesPerElement}function c(d,h){e.drawElements(i,h,s,d*o),n.update(h,i,1)}function l(d,h,f){if(f===0)return;e.drawElementsInstanced(i,h,s,d*o,f),n.update(h,i,f)}function u(d,h,f){if(f===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,h,0,s,d,0,f);let S=0;for(let p=0;p<f;p++)S+=h[p];n.update(S,i,1)}this.setMode=r,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=u}function ub(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function i(s,o,a){switch(n.calls++,o){case e.TRIANGLES:n.triangles+=a*(s/3);break;case e.LINES:n.lines+=a*(s/2);break;case e.LINE_STRIP:n.lines+=a*(s-1);break;case e.LINE_LOOP:n.lines+=a*s;break;case e.POINTS:n.points+=a*s;break;default:Ne("WebGLInfo: Unknown draw mode:",o);break}}function r(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:r,update:i}}function hb(e,t,n){let i=new WeakMap,r=new ot;function s(o,a,c){let l=o.morphTargetInfluences,u=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,d=u!==void 0?u.length:0,h=i.get(a);if(h===void 0||h.count!==d){let M=function(){R.dispose(),i.delete(a),a.removeEventListener("dispose",M)};if(h!==void 0)h.texture.dispose();let f=a.morphAttributes.position!==void 0,g=a.morphAttributes.normal!==void 0,S=a.morphAttributes.color!==void 0,p=a.morphAttributes.position||[],m=a.morphAttributes.normal||[],T=a.morphAttributes.color||[],A=0;if(f===!0)A=1;if(g===!0)A=2;if(S===!0)A=3;let v=a.attributes.position.count*A,w=1;if(v>t.maxTextureSize)w=Math.ceil(v/t.maxTextureSize),v=t.maxTextureSize;let E=new Float32Array(v*w*4*d),R=new aa(E,v,w,d);R.type=si,R.needsUpdate=!0;let x=A*4;for(let H=0;H<d;H++){let O=p[H],z=m[H],D=T[H],C=v*w*4*H;for(let F=0;F<O.count;F++){let Z=F*x;if(f===!0)r.fromBufferAttribute(O,F),E[C+Z+0]=r.x,E[C+Z+1]=r.y,E[C+Z+2]=r.z,E[C+Z+3]=0;if(g===!0)r.fromBufferAttribute(z,F),E[C+Z+4]=r.x,E[C+Z+5]=r.y,E[C+Z+6]=r.z,E[C+Z+7]=0;if(S===!0)r.fromBufferAttribute(D,F),E[C+Z+8]=r.x,E[C+Z+9]=r.y,E[C+Z+10]=r.z,E[C+Z+11]=D.itemSize===4?r.w:1}}h={count:d,texture:R,size:new Ue(v,w)},i.set(a,h),a.addEventListener("dispose",M)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)c.getUniforms().setValue(e,"morphTexture",o.morphTexture,n);else{let f=0;for(let S=0;S<l.length;S++)f+=l[S];let g=a.morphTargetsRelative?1:1-f;c.getUniforms().setValue(e,"morphTargetBaseInfluence",g),c.getUniforms().setValue(e,"morphTargetInfluences",l)}c.getUniforms().setValue(e,"morphTargetsTexture",h.texture,n),c.getUniforms().setValue(e,"morphTargetsTextureSize",h.size)}return{update:s}}function db(e,t,n,i,r){let s=new WeakMap;function o(l){let u=r.render.frame,d=l.geometry,h=t.get(l,d);if(s.get(h)!==u)t.update(h),s.set(h,u);if(l.isInstancedMesh){if(l.hasEventListener("dispose",c)===!1)l.addEventListener("dispose",c);if(s.get(l)!==u){if(n.update(l.instanceMatrix,e.ARRAY_BUFFER),l.instanceColor!==null)n.update(l.instanceColor,e.ARRAY_BUFFER);s.set(l,u)}}if(l.isSkinnedMesh){let f=l.skeleton;if(s.get(f)!==u)f.update(),s.set(f,u)}return h}function a(){s=new WeakMap}function c(l){let u=l.target;if(u.removeEventListener("dispose",c),i.releaseStatesOfObject(u),n.remove(u.instanceMatrix),u.instanceColor!==null)n.remove(u.instanceColor)}return{update:o,dispose:a}}var fb={[kc]:"LINEAR_TONE_MAPPING",[Bc]:"REINHARD_TONE_MAPPING",[Gc]:"CINEON_TONE_MAPPING",[Hc]:"ACES_FILMIC_TONE_MAPPING",[Wc]:"AGX_TONE_MAPPING",[$c]:"NEUTRAL_TONE_MAPPING",[Vc]:"CUSTOM_TONE_MAPPING"};function pb(e,t,n,i,r,s){let o=new an(t,n,{type:e,depthBuffer:r,stencilBuffer:s,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),a=null,c=null,l=new Mt;l.setAttribute("position",new bt([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new bt([0,2,0,0,2,0],2));let u=new Hl({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),d=new xt(l,u),h=new nr(-1,1,1,-1,0,1),f=null,g=null,S=!1,p,m=null,T=[],A=!1;this.setSize=function(v,w){if(o.setSize(v,w),a!==null)a.setSize(v,w);if(c!==null)c.setSize(v,w);for(let E=0;E<T.length;E++){let R=T[E];if(R.setSize)R.setSize(v,w)}},this.setEffects=function(v){T=v,A=T.length>0&&T[0].isRenderPass===!0;let{width:w,height:E}=o;if(T.length>0&&a===null)a=new an(w,E,{type:Fn,depthBuffer:!1,stencilBuffer:!1}),c=new an(w,E,{type:Fn,depthBuffer:!1,stencilBuffer:!1});for(let R=0;R<T.length;R++){let x=T[R];if(x.setSize)x.setSize(w,E)}},this.begin=function(v,w){if(S)return!1;if(v.toneMapping===wn&&T.length===0)return!1;if(m=w,w!==null){let{width:E,height:R}=w;if(o.width!==E||o.height!==R)this.setSize(E,R)}if(A===!1)v.setRenderTarget(o);return p=v.toneMapping,v.toneMapping=wn,!0},this.hasRenderPass=function(){return A},this.end=function(v,w){v.toneMapping=p,S=!0;let E=o,R=a;for(let x=0;x<T.length;x++){let M=T[x];if(M.enabled===!1)continue;if(M.render(v,R,E,w),M.needsSwap!==!1)E=R,R=R===a?c:a}if(f!==v.outputColorSpace||g!==v.toneMapping){if(f=v.outputColorSpace,g=v.toneMapping,u.defines={},He.getTransfer(f)===ut)u.defines.SRGB_TRANSFER="";let x=fb[g];if(x)u.defines[x]="";u.needsUpdate=!0}u.uniforms.tDiffuse.value=E.texture,v.setRenderTarget(m),v.render(d,h),m=null,S=!1},this.isCompositing=function(){return S},this.dispose=function(){if(o.dispose(),a!==null)a.dispose();if(c!==null)c.dispose();l.dispose(),u.dispose()}}var Hg=new _t,uu=new Qi(1,1),Vg=new aa,Wg=new zl,$g=new fa,Mg=[],wg=[],Tg=new Float32Array(16),Eg=new Float32Array(9),Ag=new Float32Array(4);function qr(e,t,n){let i=e[0];if(i<=0||i>0)return e;let r=t*n,s=Mg[r];if(s===void 0)s=new Float32Array(r),Mg[r]=s;if(t!==0){i.toArray(s,0);for(let o=1,a=0;o!==t;++o)a+=n,e[o].toArray(s,a)}return s}function Nt(e,t){if(e.length!==t.length)return!1;for(let n=0,i=e.length;n<i;n++)if(e[n]!==t[n])return!1;return!0}function Dt(e,t){for(let n=0,i=t.length;n<i;n++)e[n]=t[n]}function Aa(e,t){let n=wg[t];if(n===void 0)n=new Int32Array(t),wg[t]=n;for(let i=0;i!==t;++i)n[i]=e.allocateTextureUnit();return n}function mb(e,t){let n=this.cache;if(n[0]===t)return;e.uniform1f(this.addr,t),n[0]=t}function gb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y)e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y}else{if(Nt(n,t))return;e.uniform2fv(this.addr,t),Dt(n,t)}}function _b(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z}else if(t.r!==void 0){if(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b}else{if(Nt(n,t))return;e.uniform3fv(this.addr,t),Dt(n,t)}}function xb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w}else{if(Nt(n,t))return;e.uniform4fv(this.addr,t),Dt(n,t)}}function vb(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Nt(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),Dt(n,t)}else{if(Nt(n,i))return;Ag.set(i),e.uniformMatrix2fv(this.addr,!1,Ag),Dt(n,i)}}function yb(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Nt(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),Dt(n,t)}else{if(Nt(n,i))return;Eg.set(i),e.uniformMatrix3fv(this.addr,!1,Eg),Dt(n,i)}}function Sb(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Nt(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),Dt(n,t)}else{if(Nt(n,i))return;Tg.set(i),e.uniformMatrix4fv(this.addr,!1,Tg),Dt(n,i)}}function bb(e,t){let n=this.cache;if(n[0]===t)return;e.uniform1i(this.addr,t),n[0]=t}function Mb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y)e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y}else{if(Nt(n,t))return;e.uniform2iv(this.addr,t),Dt(n,t)}}function wb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z}else{if(Nt(n,t))return;e.uniform3iv(this.addr,t),Dt(n,t)}}function Tb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w}else{if(Nt(n,t))return;e.uniform4iv(this.addr,t),Dt(n,t)}}function Eb(e,t){let n=this.cache;if(n[0]===t)return;e.uniform1ui(this.addr,t),n[0]=t}function Ab(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y)e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y}else{if(Nt(n,t))return;e.uniform2uiv(this.addr,t),Dt(n,t)}}function Rb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z}else{if(Nt(n,t))return;e.uniform3uiv(this.addr,t),Dt(n,t)}}function Cb(e,t){let n=this.cache;if(t.x!==void 0){if(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w}else{if(Nt(n,t))return;e.uniform4uiv(this.addr,t),Dt(n,t)}}function Ib(e,t,n){let i=this.cache,r=n.allocateTextureUnit();if(i[0]!==r)e.uniform1i(this.addr,r),i[0]=r;let s;if(this.type===e.SAMPLER_2D_SHADOW)uu.compareFunction=n.isReversedDepthBuffer()?oa:sa,s=uu;else s=Hg;n.setTexture2D(t||s,r)}function Pb(e,t,n){let i=this.cache,r=n.allocateTextureUnit();if(i[0]!==r)e.uniform1i(this.addr,r),i[0]=r;n.setTexture3D(t||Wg,r)}function Lb(e,t,n){let i=this.cache,r=n.allocateTextureUnit();if(i[0]!==r)e.uniform1i(this.addr,r),i[0]=r;n.setTextureCube(t||$g,r)}function Nb(e,t,n){let i=this.cache,r=n.allocateTextureUnit();if(i[0]!==r)e.uniform1i(this.addr,r),i[0]=r;n.setTexture2DArray(t||Vg,r)}function Db(e){switch(e){case 5126:return mb;case 35664:return gb;case 35665:return _b;case 35666:return xb;case 35674:return vb;case 35675:return yb;case 35676:return Sb;case 5124:case 35670:return bb;case 35667:case 35671:return Mb;case 35668:case 35672:return wb;case 35669:case 35673:return Tb;case 5125:return Eb;case 36294:return Ab;case 36295:return Rb;case 36296:return Cb;case 35678:case 36198:case 36298:case 36306:case 35682:return Ib;case 35679:case 36299:case 36307:return Pb;case 35680:case 36300:case 36308:case 36293:return Lb;case 36289:case 36303:case 36311:case 36292:return Nb}}function Ub(e,t){e.uniform1fv(this.addr,t)}function Ob(e,t){let n=qr(t,this.size,2);e.uniform2fv(this.addr,n)}function Fb(e,t){let n=qr(t,this.size,3);e.uniform3fv(this.addr,n)}function zb(e,t){let n=qr(t,this.size,4);e.uniform4fv(this.addr,n)}function kb(e,t){let n=qr(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function Bb(e,t){let n=qr(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function Gb(e,t){let n=qr(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function Hb(e,t){e.uniform1iv(this.addr,t)}function Vb(e,t){e.uniform2iv(this.addr,t)}function Wb(e,t){e.uniform3iv(this.addr,t)}function $b(e,t){e.uniform4iv(this.addr,t)}function Zb(e,t){e.uniform1uiv(this.addr,t)}function Xb(e,t){e.uniform2uiv(this.addr,t)}function qb(e,t){e.uniform3uiv(this.addr,t)}function Yb(e,t){e.uniform4uiv(this.addr,t)}function Jb(e,t,n){let i=this.cache,r=t.length,s=Aa(n,r);if(!Nt(i,s))e.uniform1iv(this.addr,s),Dt(i,s);let o;if(this.type===e.SAMPLER_2D_SHADOW)o=uu;else o=Hg;for(let a=0;a!==r;++a)n.setTexture2D(t[a]||o,s[a])}function Kb(e,t,n){let i=this.cache,r=t.length,s=Aa(n,r);if(!Nt(i,s))e.uniform1iv(this.addr,s),Dt(i,s);for(let o=0;o!==r;++o)n.setTexture3D(t[o]||Wg,s[o])}function jb(e,t,n){let i=this.cache,r=t.length,s=Aa(n,r);if(!Nt(i,s))e.uniform1iv(this.addr,s),Dt(i,s);for(let o=0;o!==r;++o)n.setTextureCube(t[o]||$g,s[o])}function Qb(e,t,n){let i=this.cache,r=t.length,s=Aa(n,r);if(!Nt(i,s))e.uniform1iv(this.addr,s),Dt(i,s);for(let o=0;o!==r;++o)n.setTexture2DArray(t[o]||Vg,s[o])}function eM(e){switch(e){case 5126:return Ub;case 35664:return Ob;case 35665:return Fb;case 35666:return zb;case 35674:return kb;case 35675:return Bb;case 35676:return Gb;case 5124:case 35670:return Hb;case 35667:case 35671:return Vb;case 35668:case 35672:return Wb;case 35669:case 35673:return $b;case 5125:return Zb;case 36294:return Xb;case 36295:return qb;case 36296:return Yb;case 35678:case 36198:case 36298:case 36306:case 35682:return Jb;case 35679:case 36299:case 36307:return Kb;case 35680:case 36300:case 36308:case 36293:return jb;case 36289:case 36303:case 36311:case 36292:return Qb}}class Zg{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=Db(t.type)}}class Xg{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=eM(t.type)}}class qg{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let i=this.seq;for(let r=0,s=i.length;r!==s;++r){let o=i[r];o.setValue(e,t[o.id],n)}}}var au=/(\w+)(\])?(\[|\.)?/g;function Rg(e,t){e.seq.push(t),e.map[t.id]=t}function tM(e,t,n){let i=e.name,r=i.length;au.lastIndex=0;while(!0){let s=au.exec(i),o=au.lastIndex,a=s[1],c=s[2]==="]",l=s[3];if(c)a=a|0;if(l===void 0||l==="["&&o+2===r){Rg(n,l===void 0?new Zg(a,e,t):new Xg(a,e,t));break}else{let d=n.map[a];if(d===void 0)d=new qg(a),Rg(n,d);n=d}}}class Ws{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let s=0;s<n;++s){let o=e.getActiveUniform(t,s),a=e.getUniformLocation(t,o.name);tM(o,a,this)}let i=[],r=[];for(let s of this.seq)if(s.type===e.SAMPLER_2D_SHADOW||s.type===e.SAMPLER_CUBE_SHADOW||s.type===e.SAMPLER_2D_ARRAY_SHADOW)i.push(s);else r.push(s);if(i.length>0)this.seq=i.concat(r)}setValue(e,t,n,i){let r=this.map[t];if(r!==void 0)r.setValue(e,n,i)}setOptional(e,t,n){let i=t[n];if(i!==void 0)this.setValue(e,n,i)}static upload(e,t,n,i){for(let r=0,s=t.length;r!==s;++r){let o=t[r],a=n[o.id];if(a.needsUpdate!==!1)o.setValue(e,a.value,i)}}static seqWithValue(e,t){let n=[];for(let i=0,r=e.length;i!==r;++i){let s=e[i];if(s.id in t)n.push(s)}return n}}function Cg(e,t,n){let i=e.createShader(t);return e.shaderSource(i,n),e.compileShader(i),i}var nM=37297,iM=0;function rM(e,t){let n=e.split(`
`),i=[],r=Math.max(t-6,0),s=Math.min(t+6,n.length);for(let o=r;o<s;o++){let a=o+1;i.push(`${a===t?">":" "} ${a}: ${n[o]}`)}return i.join(`
`)}var Ig=new Fe;function sM(e){He._getMatrix(Ig,He.workingColorSpace,e);let t=`mat3( ${Ig.elements.map((n)=>n.toFixed(4))} )`;switch(He.getTransfer(e)){case Ll:return[t,"LinearTransferOETF"];case ut:return[t,"sRGBTransferOETF"];default:return Te("WebGLProgram: Unsupported color space: ",e),[t,"LinearTransferOETF"]}}function Pg(e,t,n){let i=e.getShaderParameter(t,e.COMPILE_STATUS),s=(e.getShaderInfoLog(t)||"").trim();if(i&&s==="")return"";let o=/ERROR: 0:(\d+)/.exec(s);if(o){let a=parseInt(o[1]);return n.toUpperCase()+`

`+s+`

`+rM(e.getShaderSource(t),a)}else return s}function oM(e,t){let n=sM(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,"}"].join(`
`)}var aM={[kc]:"Linear",[Bc]:"Reinhard",[Gc]:"Cineon",[Hc]:"ACESFilmic",[Wc]:"AgX",[$c]:"Neutral",[Vc]:"Custom"};function cM(e,t){let n=aM[t];if(n===void 0)return Te("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+e+"( vec3 color ) { return LinearToneMapping( color ); }";return"vec3 "+e+"( vec3 color ) { return "+n+"ToneMapping( color ); }"}var Ta=new U;function lM(){He.getLuminanceCoefficients(Ta);let e=Ta.x.toFixed(4),t=Ta.y.toFixed(4),n=Ta.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${e}, ${t}, ${n} );`,"\treturn dot( weights, rgb );","}"].join(`
`)}function uM(e){return[e.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",e.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Vs).join(`
`)}function hM(e){let t=[];for(let n in e){let i=e[n];if(i===!1)continue;t.push("#define "+n+" "+i)}return t.join(`
`)}function dM(e,t){let n={},i=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let r=0;r<i;r++){let s=e.getActiveAttrib(t,r),o=s.name,a=1;if(s.type===e.FLOAT_MAT2)a=2;if(s.type===e.FLOAT_MAT3)a=3;if(s.type===e.FLOAT_MAT4)a=4;n[o]={type:s.type,location:e.getAttribLocation(t,o),locationSize:a}}return n}function Vs(e){return e!==""}function Lg(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Ng(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var fM=/^[ \t]*#include +<([\w\d./]+)>/gm;function hu(e){return e.replace(fM,mM)}var pM=new Map;function mM(e,t){let n=Ge[t];if(n===void 0){let i=pM.get(t);if(i!==void 0)n=Ge[i],Te('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,i);else throw Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return hu(n)}var gM=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Dg(e){return e.replace(gM,_M)}function _M(e,t,n,i){let r="";for(let s=parseInt(t);s<parseInt(n);s++)r+=i.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return r}function Ug(e){let t=`precision ${e.precision} float;
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
#define LOW_PRECISION`;return t}var xM={[ys]:"SHADOWMAP_TYPE_PCF",[Nr]:"SHADOWMAP_TYPE_VSM"};function vM(e){return xM[e.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var yM={[Ur]:"ENVMAP_TYPE_CUBE",[Zi]:"ENVMAP_TYPE_CUBE",[bs]:"ENVMAP_TYPE_CUBE_UV"};function SM(e){if(e.envMap===!1)return"ENVMAP_TYPE_CUBE";return yM[e.envMapMode]||"ENVMAP_TYPE_CUBE"}var bM={[Zi]:"ENVMAP_MODE_REFRACTION"};function MM(e){if(e.envMap===!1)return"ENVMAP_MODE_REFLECTION";return bM[e.envMapMode]||"ENVMAP_MODE_REFLECTION"}var wM={[Hm]:"ENVMAP_BLENDING_MULTIPLY",[Vm]:"ENVMAP_BLENDING_MIX",[Wm]:"ENVMAP_BLENDING_ADD"};function TM(e){if(e.envMap===!1)return"ENVMAP_BLENDING_NONE";return wM[e.combine]||"ENVMAP_BLENDING_NONE"}function EM(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,i=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,n),112)),texelHeight:i,maxMip:n}}function AM(e,t,n,i){let r=e.getContext(),{defines:s,vertexShader:o,fragmentShader:a}=n,c=vM(n),l=SM(n),u=MM(n),d=TM(n),h=EM(n),f=uM(n),g=hM(s),S=r.createProgram(),p,m,T=n.glslVersion?"#version "+n.glslVersion+`
`:"";if(n.isRawShaderMaterial){if(p=["#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g].filter(Vs).join(`
`),p.length>0)p+=`
`;if(m=["#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g].filter(Vs).join(`
`),m.length>0)m+=`
`}else p=[Ug(n),"#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g,n.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",n.batching?"#define USE_BATCHING":"",n.batchingColor?"#define USE_BATCHING_COLOR":"",n.instancing?"#define USE_INSTANCING":"",n.instancingColor?"#define USE_INSTANCING_COLOR":"",n.instancingMorph?"#define USE_INSTANCING_MORPH":"",n.useFog&&n.fog?"#define USE_FOG":"",n.useFog&&n.fogExp2?"#define FOG_EXP2":"",n.map?"#define USE_MAP":"",n.envMap?"#define USE_ENVMAP":"",n.envMap?"#define "+u:"",n.lightMap?"#define USE_LIGHTMAP":"",n.aoMap?"#define USE_AOMAP":"",n.bumpMap?"#define USE_BUMPMAP":"",n.normalMap?"#define USE_NORMALMAP":"",n.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",n.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",n.displacementMap?"#define USE_DISPLACEMENTMAP":"",n.emissiveMap?"#define USE_EMISSIVEMAP":"",n.anisotropy?"#define USE_ANISOTROPY":"",n.anisotropyMap?"#define USE_ANISOTROPYMAP":"",n.clearcoatMap?"#define USE_CLEARCOATMAP":"",n.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",n.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",n.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",n.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",n.specularMap?"#define USE_SPECULARMAP":"",n.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",n.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",n.roughnessMap?"#define USE_ROUGHNESSMAP":"",n.metalnessMap?"#define USE_METALNESSMAP":"",n.alphaMap?"#define USE_ALPHAMAP":"",n.alphaHash?"#define USE_ALPHAHASH":"",n.transmission?"#define USE_TRANSMISSION":"",n.transmissionMap?"#define USE_TRANSMISSIONMAP":"",n.thicknessMap?"#define USE_THICKNESSMAP":"",n.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",n.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",n.mapUv?"#define MAP_UV "+n.mapUv:"",n.alphaMapUv?"#define ALPHAMAP_UV "+n.alphaMapUv:"",n.lightMapUv?"#define LIGHTMAP_UV "+n.lightMapUv:"",n.aoMapUv?"#define AOMAP_UV "+n.aoMapUv:"",n.emissiveMapUv?"#define EMISSIVEMAP_UV "+n.emissiveMapUv:"",n.bumpMapUv?"#define BUMPMAP_UV "+n.bumpMapUv:"",n.normalMapUv?"#define NORMALMAP_UV "+n.normalMapUv:"",n.displacementMapUv?"#define DISPLACEMENTMAP_UV "+n.displacementMapUv:"",n.metalnessMapUv?"#define METALNESSMAP_UV "+n.metalnessMapUv:"",n.roughnessMapUv?"#define ROUGHNESSMAP_UV "+n.roughnessMapUv:"",n.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+n.anisotropyMapUv:"",n.clearcoatMapUv?"#define CLEARCOATMAP_UV "+n.clearcoatMapUv:"",n.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+n.clearcoatNormalMapUv:"",n.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+n.clearcoatRoughnessMapUv:"",n.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+n.iridescenceMapUv:"",n.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+n.iridescenceThicknessMapUv:"",n.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+n.sheenColorMapUv:"",n.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+n.sheenRoughnessMapUv:"",n.specularMapUv?"#define SPECULARMAP_UV "+n.specularMapUv:"",n.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+n.specularColorMapUv:"",n.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+n.specularIntensityMapUv:"",n.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+n.transmissionMapUv:"",n.thicknessMapUv?"#define THICKNESSMAP_UV "+n.thicknessMapUv:"",n.vertexTangents&&n.flatShading===!1?"#define USE_TANGENT":"",n.vertexNormals?"#define HAS_NORMAL":"",n.vertexColors?"#define USE_COLOR":"",n.vertexAlphas?"#define USE_COLOR_ALPHA":"",n.vertexUv1s?"#define USE_UV1":"",n.vertexUv2s?"#define USE_UV2":"",n.vertexUv3s?"#define USE_UV3":"",n.pointsUvs?"#define USE_POINTS_UV":"",n.flatShading?"#define FLAT_SHADED":"",n.skinning?"#define USE_SKINNING":"",n.morphTargets?"#define USE_MORPHTARGETS":"",n.morphNormals&&n.flatShading===!1?"#define USE_MORPHNORMALS":"",n.morphColors?"#define USE_MORPHCOLORS":"",n.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+n.morphTextureStride:"",n.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+n.morphTargetsCount:"",n.doubleSided?"#define DOUBLE_SIDED":"",n.flipSided?"#define FLIP_SIDED":"",n.shadowMapEnabled?"#define USE_SHADOWMAP":"",n.shadowMapEnabled?"#define "+c:"",n.sizeAttenuation?"#define USE_SIZEATTENUATION":"",n.numLightProbes>0?"#define USE_LIGHT_PROBES":"",n.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",n.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","\tattribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","\tattribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","\tuniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","\tattribute vec2 uv1;","#endif","#ifdef USE_UV2","\tattribute vec2 uv2;","#endif","#ifdef USE_UV3","\tattribute vec2 uv3;","#endif","#ifdef USE_TANGENT","\tattribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","\tattribute vec4 color;","#elif defined( USE_COLOR )","\tattribute vec3 color;","#endif","#ifdef USE_SKINNING","\tattribute vec4 skinIndex;","\tattribute vec4 skinWeight;","#endif",`
`].filter(Vs).join(`
`),m=[Ug(n),"#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g,n.useFog&&n.fog?"#define USE_FOG":"",n.useFog&&n.fogExp2?"#define FOG_EXP2":"",n.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",n.map?"#define USE_MAP":"",n.matcap?"#define USE_MATCAP":"",n.envMap?"#define USE_ENVMAP":"",n.envMap?"#define "+l:"",n.envMap?"#define "+u:"",n.envMap?"#define "+d:"",h?"#define CUBEUV_TEXEL_WIDTH "+h.texelWidth:"",h?"#define CUBEUV_TEXEL_HEIGHT "+h.texelHeight:"",h?"#define CUBEUV_MAX_MIP "+h.maxMip+".0":"",n.lightMap?"#define USE_LIGHTMAP":"",n.aoMap?"#define USE_AOMAP":"",n.bumpMap?"#define USE_BUMPMAP":"",n.normalMap?"#define USE_NORMALMAP":"",n.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",n.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",n.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",n.emissiveMap?"#define USE_EMISSIVEMAP":"",n.anisotropy?"#define USE_ANISOTROPY":"",n.anisotropyMap?"#define USE_ANISOTROPYMAP":"",n.clearcoat?"#define USE_CLEARCOAT":"",n.clearcoatMap?"#define USE_CLEARCOATMAP":"",n.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",n.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",n.dispersion?"#define USE_DISPERSION":"",n.retroreflection?"#define USE_RETROREFLECTION":"",n.iridescence?"#define USE_IRIDESCENCE":"",n.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",n.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",n.specularMap?"#define USE_SPECULARMAP":"",n.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",n.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",n.roughnessMap?"#define USE_ROUGHNESSMAP":"",n.metalnessMap?"#define USE_METALNESSMAP":"",n.alphaMap?"#define USE_ALPHAMAP":"",n.alphaTest?"#define USE_ALPHATEST":"",n.alphaHash?"#define USE_ALPHAHASH":"",n.sheen?"#define USE_SHEEN":"",n.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",n.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",n.transmission?"#define USE_TRANSMISSION":"",n.transmissionMap?"#define USE_TRANSMISSIONMAP":"",n.thicknessMap?"#define USE_THICKNESSMAP":"",n.vertexTangents&&n.flatShading===!1?"#define USE_TANGENT":"",n.vertexColors||n.instancingColor?"#define USE_COLOR":"",n.vertexAlphas||n.batchingColor?"#define USE_COLOR_ALPHA":"",n.vertexUv1s?"#define USE_UV1":"",n.vertexUv2s?"#define USE_UV2":"",n.vertexUv3s?"#define USE_UV3":"",n.pointsUvs?"#define USE_POINTS_UV":"",n.gradientMap?"#define USE_GRADIENTMAP":"",n.flatShading?"#define FLAT_SHADED":"",n.doubleSided?"#define DOUBLE_SIDED":"",n.flipSided?"#define FLIP_SIDED":"",n.shadowMapEnabled?"#define USE_SHADOWMAP":"",n.shadowMapEnabled?"#define "+c:"",n.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",n.numLightProbes>0?"#define USE_LIGHT_PROBES":"",n.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",n.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",n.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",n.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",n.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",n.toneMapping!==wn?"#define TONE_MAPPING":"",n.toneMapping!==wn?Ge.tonemapping_pars_fragment:"",n.toneMapping!==wn?cM("toneMapping",n.toneMapping):"",n.dithering?"#define DITHERING":"",n.opaque?"#define OPAQUE":"",Ge.colorspace_pars_fragment,oM("linearToOutputTexel",n.outputColorSpace),lM(),n.useDepthPacking?"#define DEPTH_PACKING "+n.depthPacking:"",`
`].filter(Vs).join(`
`);if(o=hu(o),o=Lg(o,n),o=Ng(o,n),a=hu(a),a=Lg(a,n),a=Ng(a,n),o=Dg(o),a=Dg(a),n.isRawShaderMaterial!==!0)T=`#version 300 es
`,p=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,m=["#define varying in",n.glslVersion===Nl?"":"layout(location = 0) out highp vec4 pc_fragColor;",n.glslVersion===Nl?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+m;let A=T+p+o,v=T+m+a,w=Cg(r,r.VERTEX_SHADER,A),E=Cg(r,r.FRAGMENT_SHADER,v);if(r.attachShader(S,w),r.attachShader(S,E),n.index0AttributeName!==void 0)r.bindAttribLocation(S,0,n.index0AttributeName);else if(n.hasPositionAttribute===!0)r.bindAttribLocation(S,0,"position");r.linkProgram(S);function R(O){if(e.debug.checkShaderErrors){let z=r.getProgramInfoLog(S)||"",D=r.getShaderInfoLog(w)||"",C=r.getShaderInfoLog(E)||"",F=z.trim(),Z=D.trim(),G=C.trim(),ie=!0,X=!0;if(r.getProgramParameter(S,r.LINK_STATUS)===!1)if(ie=!1,typeof e.debug.onShaderError==="function")e.debug.onShaderError(r,S,w,E);else{let Q=Pg(r,w,"vertex"),ee=Pg(r,E,"fragment");Ne("WebGLProgram: Shader Error "+r.getError()+" - VALIDATE_STATUS "+r.getProgramParameter(S,r.VALIDATE_STATUS)+`

Material Name: `+O.name+`
Material Type: `+O.type+`

Program Info Log: `+F+`
`+Q+`
`+ee)}else if(F!=="")Te("WebGLProgram: Program Info Log:",F);else if(Z===""||G==="")X=!1;if(X)O.diagnostics={runnable:ie,programLog:F,vertexShader:{log:Z,prefix:p},fragmentShader:{log:G,prefix:m}}}r.deleteShader(w),r.deleteShader(E),x=new Ws(r,S),M=dM(r,S)}let x;this.getUniforms=function(){if(x===void 0)R(this);return x};let M;this.getAttributes=function(){if(M===void 0)R(this);return M};let H=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){if(H===!1)H=r.getProgramParameter(S,nM);return H},this.destroy=function(){i.releaseStatesOfProgram(this),r.deleteProgram(S),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=iM++,this.cacheKey=t,this.usedTimes=1,this.program=S,this.vertexShader=w,this.fragmentShader=E,this}var RM=0;class Yg{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let i=this._getShaderCacheForMaterial(e);if(i.has(t)===!1)i.add(t),t.usedTimes++;if(i.has(n)===!1)i.add(n),n.usedTimes++;return this}remove(e){let t=this.materialCache.get(e);for(let n of t)if(n.usedTimes--,n.usedTimes===0)this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);if(n===void 0)n=new Set,t.set(e,n);return n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);if(n===void 0)n=new Jg(e),t.set(e,n);return n}}class Jg{constructor(e){this.id=RM++,this.code=e,this.usedTimes=0}}function CM(e){return e===Ji||e===na||e===ia}function IM(e,t,n,i,r,s){let o=new Es,a=new Yg,c=new Set,l=[],u=new Map,{logarithmicDepthBuffer:d,precision:h}=i,f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(x){if(c.add(x),x===0)return"uv";return`uv${x}`}function S(x,M,H,O,z,D){let C=O.fog,F=z.geometry,Z=x.isMeshStandardMaterial||x.isMeshLambertMaterial||x.isMeshPhongMaterial?O.environment:null,G=x.isMeshStandardMaterial||x.isMeshLambertMaterial&&!x.envMap||x.isMeshPhongMaterial&&!x.envMap,ie=t.get(x.envMap||Z,G),X=!!ie&&ie.mapping===bs?ie.image.height:null,Q=f[x.type];if(x.precision!==null){if(h=i.getMaxPrecision(x.precision),h!==x.precision)Te("WebGLProgram.getParameters:",x.precision,"not supported, using",h,"instead.")}let ee=F.morphAttributes.position||F.morphAttributes.normal||F.morphAttributes.color,ve=ee!==void 0?ee.length:0,Ee=0;if(F.morphAttributes.position!==void 0)Ee=1;if(F.morphAttributes.normal!==void 0)Ee=2;if(F.morphAttributes.color!==void 0)Ee=3;let qe,ke,q,re;if(Q){let ht=Wn[Q];qe=ht.vertexShader,ke=ht.fragmentShader}else{qe=x.vertexShader,ke=x.fragmentShader;let ht=a.getVertexShaderStage(x),tt=a.getFragmentShaderStage(x);a.update(x,ht,tt),q=ht.id,re=tt.id}let se=e.getRenderTarget(),Pe=e.state.buffers.depth.getReversed(),De=z.isInstancedMesh===!0,Ce=z.isBatchedMesh===!0,Ct=!!x.map,Xe=!!x.matcap,Ye=!!ie,it=!!x.aoMap,Je=!!x.lightMap,kt=!!x.bumpMap&&x.wireframe===!1,ft=!!x.normalMap,Yt=!!x.displacementMap,It=!!x.emissiveMap,Pt=!!x.metalnessMap,P=!!x.roughnessMap,Jt=x.anisotropy>0,et=x.clearcoat>0,vt=x.dispersion>0,b=x.retroreflectivity>0,_=x.iridescence>0,I=x.sheen>0,V=x.transmission>0,ne=Jt&&!!x.anisotropyMap,ae=et&&!!x.clearcoatMap,ue=et&&!!x.clearcoatNormalMap,Y=et&&!!x.clearcoatRoughnessMap,j=_&&!!x.iridescenceMap,ge=_&&!!x.iridescenceThicknessMap,we=I&&!!x.sheenColorMap,he=I&&!!x.sheenRoughnessMap,oe=!!x.specularMap,Ie=!!x.specularColorMap,Le=!!x.specularIntensityMap,je=V&&!!x.transmissionMap,N=V&&!!x.thicknessMap,ce=!!x.gradientMap,J=!!x.alphaMap,le=x.alphaTest>0,_e=!!x.alphaHash,te=!!x.extensions,fe=wn;if(x.toneMapped){if(se===null||se.isXRRenderTarget===!0)fe=e.toneMapping}let ze={shaderID:Q,shaderType:x.type,shaderName:x.name,vertexShader:qe,fragmentShader:ke,defines:x.defines,customVertexShaderID:q,customFragmentShaderID:re,isRawShaderMaterial:x.isRawShaderMaterial===!0,glslVersion:x.glslVersion,precision:h,batching:Ce,batchingColor:Ce&&z._colorsTexture!==null,instancing:De,instancingColor:De&&z.instanceColor!==null,instancingMorph:De&&z.morphTexture!==null,outputColorSpace:se===null?e.outputColorSpace:se.isXRRenderTarget===!0?se.texture.colorSpace:He.workingColorSpace,alphaToCoverage:!!x.alphaToCoverage,map:Ct,matcap:Xe,envMap:Ye,envMapMode:Ye&&ie.mapping,envMapCubeUVHeight:X,aoMap:it,lightMap:Je,bumpMap:kt,normalMap:ft,displacementMap:Yt,emissiveMap:It,normalMapObjectSpace:ft&&x.normalMapType===jm,normalMapTangentSpace:ft&&x.normalMapType===Pl,packedNormalMap:ft&&x.normalMapType===Pl&&CM(x.normalMap.format),metalnessMap:Pt,roughnessMap:P,anisotropy:Jt,anisotropyMap:ne,clearcoat:et,clearcoatMap:ae,clearcoatNormalMap:ue,clearcoatRoughnessMap:Y,dispersion:vt,retroreflection:b,iridescence:_,iridescenceMap:j,iridescenceThicknessMap:ge,sheen:I,sheenColorMap:we,sheenRoughnessMap:he,specularMap:oe,specularColorMap:Ie,specularIntensityMap:Le,transmission:V,transmissionMap:je,thicknessMap:N,gradientMap:ce,opaque:x.transparent===!1&&x.blending===Ss&&x.alphaToCoverage===!1,alphaMap:J,alphaTest:le,alphaHash:_e,combine:x.combine,mapUv:Ct&&g(x.map.channel),aoMapUv:it&&g(x.aoMap.channel),lightMapUv:Je&&g(x.lightMap.channel),bumpMapUv:kt&&g(x.bumpMap.channel),normalMapUv:ft&&g(x.normalMap.channel),displacementMapUv:Yt&&g(x.displacementMap.channel),emissiveMapUv:It&&g(x.emissiveMap.channel),metalnessMapUv:Pt&&g(x.metalnessMap.channel),roughnessMapUv:P&&g(x.roughnessMap.channel),anisotropyMapUv:ne&&g(x.anisotropyMap.channel),clearcoatMapUv:ae&&g(x.clearcoatMap.channel),clearcoatNormalMapUv:ue&&g(x.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Y&&g(x.clearcoatRoughnessMap.channel),iridescenceMapUv:j&&g(x.iridescenceMap.channel),iridescenceThicknessMapUv:ge&&g(x.iridescenceThicknessMap.channel),sheenColorMapUv:we&&g(x.sheenColorMap.channel),sheenRoughnessMapUv:he&&g(x.sheenRoughnessMap.channel),specularMapUv:oe&&g(x.specularMap.channel),specularColorMapUv:Ie&&g(x.specularColorMap.channel),specularIntensityMapUv:Le&&g(x.specularIntensityMap.channel),transmissionMapUv:je&&g(x.transmissionMap.channel),thicknessMapUv:N&&g(x.thicknessMap.channel),alphaMapUv:J&&g(x.alphaMap.channel),vertexTangents:!!F.attributes.tangent&&(ft||Jt),vertexNormals:!!F.attributes.normal,vertexColors:x.vertexColors,vertexAlphas:x.vertexColors===!0&&!!F.attributes.color&&F.attributes.color.itemSize===4,pointsUvs:z.isPoints===!0&&!!F.attributes.uv&&(Ct||J),fog:!!C,useFog:x.fog===!0,fogExp2:!!C&&C.isFogExp2,flatShading:x.wireframe===!1&&(x.flatShading===!0||F.attributes.normal===void 0&&ft===!1&&(x.isMeshLambertMaterial||x.isMeshPhongMaterial||x.isMeshStandardMaterial||x.isMeshPhysicalMaterial)),sizeAttenuation:x.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:Pe,skinning:z.isSkinnedMesh===!0,hasPositionAttribute:F.attributes.position!==void 0,morphTargets:F.morphAttributes.position!==void 0,morphNormals:F.morphAttributes.normal!==void 0,morphColors:F.morphAttributes.color!==void 0,morphTargetsCount:ve,morphTextureStride:Ee,numSunLights:M.sun.length,numDirLights:M.directional.length,numPointLights:M.point.length,numSpotLights:M.spot.length,numSpotLightMaps:M.spotLightMap.length,numRectAreaLights:M.rectArea.length,numHemiLights:M.hemi.length,numSunLightShadows:M.sunShadowMap.length,numDirLightShadows:M.directionalShadowMap.length,numPointLightShadows:M.pointShadowMap.length,numSpotLightShadows:M.spotShadowMap.length,numSpotLightShadowsWithMaps:M.numSpotLightShadowsWithMaps,numLightProbes:M.numLightProbes,numLightProbeGrids:D.length,numClippingPlanes:s.numPlanes,numClipIntersection:s.numIntersection,dithering:x.dithering,shadowMapEnabled:e.shadowMap.enabled&&H.length>0,shadowMapType:e.shadowMap.type,toneMapping:fe,decodeVideoTexture:Ct&&x.map.isVideoTexture===!0&&He.getTransfer(x.map.colorSpace)===ut,decodeVideoTextureEmissive:It&&x.emissiveMap.isVideoTexture===!0&&He.getTransfer(x.emissiveMap.colorSpace)===ut,premultipliedAlpha:x.premultipliedAlpha,doubleSided:x.side===mn,flipSided:x.side===jt,useDepthPacking:x.depthPacking>=0,depthPacking:x.depthPacking||0,index0AttributeName:x.index0AttributeName,extensionClipCullDistance:te&&x.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(te&&x.extensions.multiDraw===!0||Ce)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:x.customProgramCacheKey()};return ze.vertexUv1s=c.has(1),ze.vertexUv2s=c.has(2),ze.vertexUv3s=c.has(3),c.clear(),ze}function p(x){let M=[];if(x.shaderID)M.push(x.shaderID);else M.push(x.customVertexShaderID),M.push(x.customFragmentShaderID);if(x.defines!==void 0)for(let H in x.defines)M.push(H),M.push(x.defines[H]);if(x.isRawShaderMaterial===!1)m(M,x),T(M,x),M.push(e.outputColorSpace);return M.push(x.customProgramCacheKey),M.join()}function m(x,M){x.push(M.precision),x.push(M.outputColorSpace),x.push(M.envMapMode),x.push(M.envMapCubeUVHeight),x.push(M.mapUv),x.push(M.alphaMapUv),x.push(M.lightMapUv),x.push(M.aoMapUv),x.push(M.bumpMapUv),x.push(M.normalMapUv),x.push(M.displacementMapUv),x.push(M.emissiveMapUv),x.push(M.metalnessMapUv),x.push(M.roughnessMapUv),x.push(M.anisotropyMapUv),x.push(M.clearcoatMapUv),x.push(M.clearcoatNormalMapUv),x.push(M.clearcoatRoughnessMapUv),x.push(M.iridescenceMapUv),x.push(M.iridescenceThicknessMapUv),x.push(M.sheenColorMapUv),x.push(M.sheenRoughnessMapUv),x.push(M.specularMapUv),x.push(M.specularColorMapUv),x.push(M.specularIntensityMapUv),x.push(M.transmissionMapUv),x.push(M.thicknessMapUv),x.push(M.combine),x.push(M.fogExp2),x.push(M.sizeAttenuation),x.push(M.morphTargetsCount),x.push(M.morphAttributeCount),x.push(M.numSunLights),x.push(M.numDirLights),x.push(M.numPointLights),x.push(M.numSpotLights),x.push(M.numSpotLightMaps),x.push(M.numHemiLights),x.push(M.numRectAreaLights),x.push(M.numSunLightShadows),x.push(M.numDirLightShadows),x.push(M.numPointLightShadows),x.push(M.numSpotLightShadows),x.push(M.numSpotLightShadowsWithMaps),x.push(M.numLightProbes),x.push(M.shadowMapType),x.push(M.toneMapping),x.push(M.numClippingPlanes),x.push(M.numClipIntersection),x.push(M.depthPacking)}function T(x,M){if(o.disableAll(),M.instancing)o.enable(0);if(M.instancingColor)o.enable(1);if(M.instancingMorph)o.enable(2);if(M.matcap)o.enable(3);if(M.envMap)o.enable(4);if(M.normalMapObjectSpace)o.enable(5);if(M.normalMapTangentSpace)o.enable(6);if(M.clearcoat)o.enable(7);if(M.iridescence)o.enable(8);if(M.alphaTest)o.enable(9);if(M.vertexColors)o.enable(10);if(M.vertexAlphas)o.enable(11);if(M.vertexUv1s)o.enable(12);if(M.vertexUv2s)o.enable(13);if(M.vertexUv3s)o.enable(14);if(M.vertexTangents)o.enable(15);if(M.anisotropy)o.enable(16);if(M.alphaHash)o.enable(17);if(M.batching)o.enable(18);if(M.dispersion)o.enable(19);if(M.retroreflection)o.enable(24);if(M.batchingColor)o.enable(20);if(M.gradientMap)o.enable(21);if(M.packedNormalMap)o.enable(22);if(M.vertexNormals)o.enable(23);if(x.push(o.mask),o.disableAll(),M.fog)o.enable(0);if(M.useFog)o.enable(1);if(M.flatShading)o.enable(2);if(M.logarithmicDepthBuffer)o.enable(3);if(M.reversedDepthBuffer)o.enable(4);if(M.skinning)o.enable(5);if(M.morphTargets)o.enable(6);if(M.morphNormals)o.enable(7);if(M.morphColors)o.enable(8);if(M.premultipliedAlpha)o.enable(9);if(M.shadowMapEnabled)o.enable(10);if(M.doubleSided)o.enable(11);if(M.flipSided)o.enable(12);if(M.useDepthPacking)o.enable(13);if(M.dithering)o.enable(14);if(M.transmission)o.enable(15);if(M.sheen)o.enable(16);if(M.opaque)o.enable(17);if(M.pointsUvs)o.enable(18);if(M.decodeVideoTexture)o.enable(19);if(M.decodeVideoTextureEmissive)o.enable(20);if(M.alphaToCoverage)o.enable(21);if(M.numLightProbeGrids>0)o.enable(22);if(M.hasPositionAttribute)o.enable(23);x.push(o.mask)}function A(x){let M=f[x.type],H;if(M){let O=Wn[M];H=hg.clone(O.uniforms)}else H=x.uniforms;return H}function v(x,M){let H=u.get(M);if(H!==void 0)++H.usedTimes;else H=new AM(e,M,x,r),l.push(H),u.set(M,H);return H}function w(x){if(--x.usedTimes===0){let M=l.indexOf(x);l[M]=l[l.length-1],l.pop(),u.delete(x.cacheKey),x.destroy()}}function E(x){a.remove(x)}function R(){a.dispose()}return{getParameters:S,getProgramCacheKey:p,getUniforms:A,acquireProgram:v,releaseProgram:w,releaseShaderCache:E,programs:l,dispose:R}}function PM(){let e=new WeakMap;function t(o){return e.has(o)}function n(o){let a=e.get(o);if(a===void 0)a={},e.set(o,a);return a}function i(o){e.delete(o)}function r(o,a,c){e.get(o)[a]=c}function s(){e=new WeakMap}return{has:t,get:n,remove:i,update:r,dispose:s}}function LM(e,t){if(e.groupOrder!==t.groupOrder)return e.groupOrder-t.groupOrder;else if(e.renderOrder!==t.renderOrder)return e.renderOrder-t.renderOrder;else if(e.material.id!==t.material.id)return e.material.id-t.material.id;else if(e.materialVariant!==t.materialVariant)return e.materialVariant-t.materialVariant;else if(e.z!==t.z)return e.z-t.z;else return e.id-t.id}function Og(e,t){if(e.groupOrder!==t.groupOrder)return e.groupOrder-t.groupOrder;else if(e.renderOrder!==t.renderOrder)return e.renderOrder-t.renderOrder;else if(e.z!==t.z)return t.z-e.z;else return e.id-t.id}function Fg(){let e=[],t=0,n=[],i=[],r=[];function s(){t=0,n.length=0,i.length=0,r.length=0}function o(h){let f=0;if(h.isInstancedMesh)f+=2;if(h.isSkinnedMesh)f+=1;return f}function a(h,f,g,S,p,m){let T=e[t];if(T===void 0)T={id:h.id,object:h,geometry:f,material:g,materialVariant:o(h),groupOrder:S,renderOrder:h.renderOrder,z:p,group:m},e[t]=T;else T.id=h.id,T.object=h,T.geometry=f,T.material=g,T.materialVariant=o(h),T.groupOrder=S,T.renderOrder=h.renderOrder,T.z=p,T.group=m;return t++,T}function c(h,f,g,S,p,m,T){if(T.reversedDepth===!0)p=-p;let A=a(h,f,g,S,p,m);if(g.transmission>0)i.push(A);else if(g.transparent===!0)r.push(A);else n.push(A)}function l(h,f,g,S,p,m){let T=a(h,f,g,S,p,m);if(g.transmission>0)i.unshift(T);else if(g.transparent===!0)r.unshift(T);else n.unshift(T)}function u(h,f){if(n.length>1)n.sort(h||LM);if(i.length>1)i.sort(f||Og);if(r.length>1)r.sort(f||Og)}function d(){for(let h=t,f=e.length;h<f;h++){let g=e[h];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return{opaque:n,transmissive:i,transparent:r,init:s,push:c,unshift:l,finish:d,sort:u}}function NM(){let e=new WeakMap;function t(i,r){let s=e.get(i),o;if(s===void 0)o=new Fg,e.set(i,[o]);else if(r>=s.length)o=new Fg,s.push(o);else o=s[r];return o}function n(){e=new WeakMap}return{get:t,dispose:n}}function DM(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case"SunLight":case"DirectionalLight":n={direction:new U,color:new Re};break;case"SpotLight":n={position:new U,direction:new U,color:new Re,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":n={position:new U,color:new Re,distance:0,decay:0};break;case"HemisphereLight":n={direction:new U,skyColor:new Re,groundColor:new Re};break;case"RectAreaLight":n={color:new Re,position:new U,halfWidth:new U,halfHeight:new U};break}return e[t.id]=n,n}}}function UM(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case"SunLight":case"DirectionalLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ue};break;case"SpotLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ue};break;case"PointLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ue,shadowCameraNear:1,shadowCameraFar:1000};break}return e[t.id]=n,n}}}var OM=0;function FM(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+(t.map?1:0)-(e.map?1:0)}function zM(e){let t=new DM,n=UM(),i={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)i.probe.push(new U);let r=new U,s=new Oe,o=new Oe;function a(l){let u=0,d=0,h=0;for(let z=0;z<9;z++)i.probe[z].set(0,0,0);let f=0,g=0,S=0,p=0,m=0,T=0,A=0,v=0,w=0,E=0,R=0,x=0,M=0,H=0;l.sort(FM);for(let z=0,D=l.length;z<D;z++){let C=l[z],{color:F,intensity:Z,distance:G}=C,ie=null;if(C.shadow&&C.shadow.map)if(C.shadow.map.texture.format===Ji)ie=C.shadow.map.texture;else ie=C.shadow.map.depthTexture||C.shadow.map.texture;if(C.isAmbientLight)u+=F.r*Z,d+=F.g*Z,h+=F.b*Z;else if(C.isLightProbe){for(let X=0;X<9;X++)i.probe[X].addScaledVector(C.sh.coefficients[X],Z);H++}else if(C.isSunLight){let X=t.get(C);if(X.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){let Q=C.shadow,ee=n.get(C);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize.copy(Q.mapSize).multiply(Q.getFrameExtents()),i.sunShadow[g]=ee,i.sunShadowMap[g]=ie;let ve=Q.getViewportCount();for(let Ee=0;Ee<ve;Ee++)i.sunShadowMatrix[S+Ee]=Q.getMatrix(Ee),i.sunShadowCascade[S+Ee]=Q._cascadeData[Ee];S+=ve,g++}i.sun[f]=X,f++}else if(C.isDirectionalLight){let X=t.get(C);if(X.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){let Q=C.shadow,ee=n.get(C);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,i.directionalShadow[p]=ee,i.directionalShadowMap[p]=ie,i.directionalShadowMatrix[p]=C.shadow.matrix,w++}i.directional[p]=X,p++}else if(C.isSpotLight){let X=t.get(C);X.position.setFromMatrixPosition(C.matrixWorld),X.color.copy(F).multiplyScalar(Z),X.distance=G,X.coneCos=Math.cos(C.angle),X.penumbraCos=Math.cos(C.angle*(1-C.penumbra)),X.decay=C.decay,i.spot[T]=X;let Q=C.shadow;if(C.map){if(i.spotLightMap[x]=C.map,x++,Q.updateMatrices(C),C.castShadow)M++}if(i.spotLightMatrix[T]=Q.matrix,C.castShadow){let ee=n.get(C);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,i.spotShadow[T]=ee,i.spotShadowMap[T]=ie,R++}T++}else if(C.isRectAreaLight){let X=t.get(C);X.color.copy(F).multiplyScalar(Z),X.halfWidth.set(C.width*0.5,0,0),X.halfHeight.set(0,C.height*0.5,0),i.rectArea[A]=X,A++}else if(C.isPointLight){let X=t.get(C);if(X.color.copy(C.color).multiplyScalar(C.intensity),X.distance=C.distance,X.decay=C.decay,C.castShadow){let Q=C.shadow,ee=n.get(C);ee.shadowIntensity=Q.intensity,ee.shadowBias=Q.bias,ee.shadowNormalBias=Q.normalBias,ee.shadowRadius=Q.radius,ee.shadowMapSize=Q.mapSize,ee.shadowCameraNear=Q.camera.near,ee.shadowCameraFar=Q.camera.far,i.pointShadow[m]=ee,i.pointShadowMap[m]=ie,i.pointShadowMatrix[m]=C.shadow.matrix,E++}i.point[m]=X,m++}else if(C.isHemisphereLight){let X=t.get(C);X.skyColor.copy(C.color).multiplyScalar(Z),X.groundColor.copy(C.groundColor).multiplyScalar(Z),i.hemi[v]=X,v++}}if(A>0)if(e.has("OES_texture_float_linear")===!0)i.rectAreaLTC1=de.LTC_FLOAT_1,i.rectAreaLTC2=de.LTC_FLOAT_2;else i.rectAreaLTC1=de.LTC_HALF_1,i.rectAreaLTC2=de.LTC_HALF_2;i.ambient[0]=u,i.ambient[1]=d,i.ambient[2]=h;let O=i.hash;if(O.sunLength!==f||O.directionalLength!==p||O.pointLength!==m||O.spotLength!==T||O.rectAreaLength!==A||O.hemiLength!==v||O.numSunShadows!==g||O.numDirectionalShadows!==w||O.numPointShadows!==E||O.numSpotShadows!==R||O.numSpotMaps!==x||O.numLightProbes!==H)i.sun.length=f,i.directional.length=p,i.spot.length=T,i.rectArea.length=A,i.point.length=m,i.hemi.length=v,i.sunShadow.length=g,i.sunShadowMap.length=g,i.sunShadowMatrix.length=S,i.sunShadowCascade.length=S,i.directionalShadow.length=w,i.directionalShadowMap.length=w,i.directionalShadowMatrix.length=w,i.pointShadow.length=E,i.pointShadowMap.length=E,i.pointShadowMatrix.length=E,i.spotShadow.length=R,i.spotShadowMap.length=R,i.spotLightMatrix.length=R+x-M,i.spotLightMap.length=x,i.numSpotLightShadowsWithMaps=M,i.numLightProbes=H,O.sunLength=f,O.directionalLength=p,O.pointLength=m,O.spotLength=T,O.rectAreaLength=A,O.hemiLength=v,O.numSunShadows=g,O.numDirectionalShadows=w,O.numPointShadows=E,O.numSpotShadows=R,O.numSpotMaps=x,O.numLightProbes=H,i.version=OM++}function c(l,u){let d=0,h=0,f=0,g=0,S=0,p=0,m=u.matrixWorldInverse;for(let T=0,A=l.length;T<A;T++){let v=l[T];if(v.isSunLight){let w=i.sun[d];w.direction.setFromMatrixPosition(v.matrixWorld),w.direction.transformDirection(m),d++}else if(v.isDirectionalLight){let w=i.directional[h];w.direction.setFromMatrixPosition(v.matrixWorld),r.setFromMatrixPosition(v.target.matrixWorld),w.direction.sub(r),w.direction.transformDirection(m),h++}else if(v.isSpotLight){let w=i.spot[g];w.position.setFromMatrixPosition(v.matrixWorld),w.position.applyMatrix4(m),w.direction.setFromMatrixPosition(v.matrixWorld),r.setFromMatrixPosition(v.target.matrixWorld),w.direction.sub(r),w.direction.transformDirection(m),g++}else if(v.isRectAreaLight){let w=i.rectArea[S];w.position.setFromMatrixPosition(v.matrixWorld),w.position.applyMatrix4(m),o.identity(),s.copy(v.matrixWorld),s.premultiply(m),o.extractRotation(s),w.halfWidth.set(v.width*0.5,0,0),w.halfHeight.set(0,v.height*0.5,0),w.halfWidth.applyMatrix4(o),w.halfHeight.applyMatrix4(o),S++}else if(v.isPointLight){let w=i.point[f];w.position.setFromMatrixPosition(v.matrixWorld),w.position.applyMatrix4(m),f++}else if(v.isHemisphereLight){let w=i.hemi[p];w.direction.setFromMatrixPosition(v.matrixWorld),w.direction.transformDirection(m),p++}}}return{setup:a,setupView:c,state:i}}function zg(e){let t=new zM(e),n=[],i=[],r=[];function s(h){d.camera=h,n.length=0,i.length=0,r.length=0}function o(h){n.push(h)}function a(h){i.push(h)}function c(h){r.push(h)}function l(){t.setup(n)}function u(h){t.setupView(n,h)}let d={lightsArray:n,shadowsArray:i,lightProbeGridArray:r,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:s,state:d,setupLights:l,setupLightsView:u,pushLight:o,pushShadow:a,pushLightProbeGrid:c}}function kM(e){let t=new WeakMap;function n(r,s=0){let o=t.get(r),a;if(o===void 0)a=new zg(e),t.set(r,[a]);else if(s>=o.length)a=new zg(e),o.push(a);else a=o[s];return a}function i(){t=new WeakMap}return{get:n,dispose:i}}var BM=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,GM=`uniform sampler2D shadow_pass;
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
}`,HM=[new U(1,0,0),new U(-1,0,0),new U(0,1,0),new U(0,-1,0),new U(0,0,1),new U(0,0,-1)],VM=[new U(0,-1,0),new U(0,-1,0),new U(0,0,1),new U(0,0,-1),new U(0,-1,0),new U(0,-1,0)],kg=new Oe,Hs=new U,cu=new U;function WM(e,t,n){let i=new Ls,r=new Ue,s=new Ue,o=new ot,a=new Fs,c=new Vl,l={},u=n.maxTextureSize,d={[Mi]:jt,[jt]:Mi,[mn]:mn},h=new en({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ue},radius:{value:4}},vertexShader:BM,fragmentShader:GM}),f=h.clone();f.defines.HORIZONTAL_PASS=1;let g=new Mt;g.setAttribute("position",new Ft(new Float32Array([-1,-1,0.5,3,-1,0.5,-1,3,0.5]),3));let S=new xt(g,h),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=ys;let m=this.type;this.render=function(E,R,x){if(p.enabled===!1)return;if(p.autoUpdate===!1&&p.needsUpdate===!1)return;if(E.length===0)return;if(this.type===pm)Te("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=ys;let M=e.getRenderTarget(),H=e.getActiveCubeFace(),O=e.getActiveMipmapLevel(),z=e.state;if(z.setBlending(Un),z.buffers.depth.getReversed()===!0)z.buffers.color.setClear(0,0,0,0);else z.buffers.color.setClear(1,1,1,1);z.buffers.depth.setTest(!0),z.setScissorTest(!1);let D=m!==this.type;if(D)R.traverse(function(C){if(C.material)if(Array.isArray(C.material))C.material.forEach((F)=>F.needsUpdate=!0);else C.material.needsUpdate=!0});for(let C=0,F=E.length;C<F;C++){let Z=E[C],G=Z.shadow;if(G===void 0){Te("WebGLShadowMap:",Z,"has no shadow.");continue}if(G.autoUpdate===!1&&G.needsUpdate===!1)continue;r.copy(G.mapSize);let ie=G.getFrameExtents();if(r.multiply(ie),s.copy(G.mapSize),r.x>u||r.y>u){if(r.x>u)s.x=Math.floor(u/ie.x),r.x=s.x*ie.x,G.mapSize.x=s.x;if(r.y>u)s.y=Math.floor(u/ie.y),r.y=s.y*ie.y,G.mapSize.y=s.y}let X=e.state.buffers.depth.getReversed();if(G.camera._reversedDepth=X,G.map===null||D===!0){if(G.map!==null){if(G.map.depthTexture!==null)G.map.depthTexture.dispose(),G.map.depthTexture=null;G.map.dispose()}if(this.type===Nr){if(Z.isPointLight){Te("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}G.map=new an(r.x,r.y,{format:Ji,type:Fn,minFilter:zt,magFilter:zt,generateMipmaps:!1}),G.map.texture.name=Z.name+".shadowMap",G.map.depthTexture=new Qi(r.x,r.y,si),G.map.depthTexture.name=Z.name+".shadowMapDepth",G.map.depthTexture.format=qi,G.map.depthTexture.compareFunction=null,G.map.depthTexture.minFilter=Tn,G.map.depthTexture.magFilter=Tn}else{if(Z.isPointLight)G.map=new du(r.x),G.map.depthTexture=new Bl(r.x,wi);else G.map=new an(r.x,r.y),G.map.depthTexture=new Qi(r.x,r.y,wi);if(G.map.depthTexture.name=Z.name+".shadowMap",G.map.depthTexture.format=qi,this.type===ys)G.map.depthTexture.compareFunction=X?oa:sa,G.map.depthTexture.minFilter=zt,G.map.depthTexture.magFilter=zt;else G.map.depthTexture.compareFunction=null,G.map.depthTexture.minFilter=Tn,G.map.depthTexture.magFilter=Tn}G.camera.updateProjectionMatrix()}if(G.map.isWebGLCubeRenderTarget!==!0&&(G.map.width!==r.x||G.map.height!==r.y))G.map.setSize(r.x,r.y);let Q=G.map.isWebGLCubeRenderTarget?6:G.getViewportCount();if(Z.isPointLight!==!0)G.updateMatrices(Z,x);for(let ee=0;ee<Q;ee++){let ve=G.getCamera(ee);if(Z.isPointLight){let{camera:Ee,matrix:qe}=G,ke=Z.distance||Ee.far;if(ke!==Ee.far)Ee.far=ke,Ee.updateProjectionMatrix();Hs.setFromMatrixPosition(Z.matrixWorld),Ee.position.copy(Hs),cu.copy(Ee.position),cu.add(HM[ee]),Ee.up.copy(VM[ee]),Ee.lookAt(cu),Ee.updateMatrixWorld(),qe.makeTranslation(-Hs.x,-Hs.y,-Hs.z),kg.multiplyMatrices(Ee.projectionMatrix,Ee.matrixWorldInverse),G._frustum.setFromProjectionMatrix(kg,Ee.coordinateSystem,Ee.reversedDepth)}if(G.map.isWebGLCubeRenderTarget)e.setRenderTarget(G.map,ee),e.clear();else{if(ee===0)e.setRenderTarget(G.map),e.clear();let Ee=G.getViewport(ee);o.set(s.x*Ee.x,s.y*Ee.y,s.x*Ee.z,s.y*Ee.w),z.viewport(o)}i=G.getFrustum(ee),v(R,x,ve,Z,this.type)}if(G.isPointLightShadow!==!0&&this.type===Nr)T(G,x);G.needsUpdate=!1}m=this.type,p.needsUpdate=!1,e.setRenderTarget(M,H,O)};function T(E,R){let x=t.update(S);if(h.defines.VSM_SAMPLES!==E.blurSamples)h.defines.VSM_SAMPLES=E.blurSamples,f.defines.VSM_SAMPLES=E.blurSamples,h.needsUpdate=!0,f.needsUpdate=!0;if(E.mapPass===null)E.mapPass=new an(r.x,r.y,{format:Ji,type:Fn});else if(E.mapPass.width!==E.map.width||E.mapPass.height!==E.map.height)E.mapPass.setSize(E.map.width,E.map.height);h.uniforms.shadow_pass.value=E.map.depthTexture,h.uniforms.resolution.value.set(E.map.width,E.map.height),h.uniforms.radius.value=E.radius,e.setRenderTarget(E.mapPass),e.clear(),e.renderBufferDirect(R,null,x,h,S,null),f.uniforms.shadow_pass.value=E.mapPass.texture,f.uniforms.resolution.value.set(E.map.width,E.map.height),f.uniforms.radius.value=E.radius,e.setRenderTarget(E.map),e.clear(),e.renderBufferDirect(R,null,x,f,S,null)}function A(E,R,x,M){let H=null,O=x.isPointLight===!0?E.customDistanceMaterial:E.customDepthMaterial;if(O!==void 0)H=O;else if(H=x.isPointLight===!0?c:a,e.localClippingEnabled&&R.clipShadows===!0&&Array.isArray(R.clippingPlanes)&&R.clippingPlanes.length!==0||R.displacementMap&&R.displacementScale!==0||R.alphaMap&&R.alphaTest>0||R.map&&R.alphaTest>0||R.alphaToCoverage===!0){let z=H.uuid,D=R.uuid,C=l[z];if(C===void 0)C={},l[z]=C;let F=C[D];if(F===void 0)F=H.clone(),C[D]=F,R.addEventListener("dispose",w);H=F}if(H.visible=R.visible,H.wireframe=R.wireframe,M===Nr)H.side=R.shadowSide!==null?R.shadowSide:R.side;else H.side=R.shadowSide!==null?R.shadowSide:d[R.side];if(H.alphaMap=R.alphaMap,H.alphaTest=R.alphaToCoverage===!0?0.5:R.alphaTest,H.map=R.map,H.clipShadows=R.clipShadows,H.clippingPlanes=R.clippingPlanes,H.clipIntersection=R.clipIntersection,H.displacementMap=R.displacementMap,H.displacementScale=R.displacementScale,H.displacementBias=R.displacementBias,H.wireframeLinewidth=R.wireframeLinewidth,H.linewidth=R.linewidth,x.isPointLight===!0&&H.isMeshDistanceMaterial===!0){let z=e.properties.get(H);z.light=x}return H}function v(E,R,x,M,H){if(E.visible===!1)return;if(E.layers.test(R.layers)&&(E.isMesh||E.isLine||E.isPoints)){if((E.castShadow||E.receiveShadow&&H===Nr)&&(!E.frustumCulled||E.intersectsFrustum(i))){E.modelViewMatrix.multiplyMatrices(x.matrixWorldInverse,E.matrixWorld);let D=t.update(E),C=E.material;if(Array.isArray(C)){let F=D.groups;for(let Z=0,G=F.length;Z<G;Z++){let ie=F[Z],X=C[ie.materialIndex];if(X&&X.visible){let Q=A(E,X,M,H);E.onBeforeShadow(e,E,R,x,D,Q,ie),e.renderBufferDirect(x,null,D,Q,E,ie),E.onAfterShadow(e,E,R,x,D,Q,ie)}}}else if(C.visible){let F=A(E,C,M,H);E.onBeforeShadow(e,E,R,x,D,F,null),e.renderBufferDirect(x,null,D,F,E,null),E.onAfterShadow(e,E,R,x,D,F,null)}}}let z=E.children;for(let D=0,C=z.length;D<C;D++)v(z[D],R,x,M,H)}function w(E){E.target.removeEventListener("dispose",w);for(let x in l){let M=l[x],H=E.target.uuid;if(H in M)M[H].dispose(),delete M[H]}}}function $M(e,t){function n(){let N=!1,ce=new ot,J=null,le=new ot(0,0,0,0);return{setMask:function(_e){if(J!==_e&&!N)e.colorMask(_e,_e,_e,_e),J=_e},setLocked:function(_e){N=_e},setClear:function(_e,te,fe,ze,ht){if(ht===!0)_e*=ze,te*=ze,fe*=ze;if(ce.set(_e,te,fe,ze),le.equals(ce)===!1)e.clearColor(_e,te,fe,ze),le.copy(ce)},reset:function(){N=!1,J=null,le.set(-1,0,0,0)}}}function i(){let N=!1,ce=!1,J=null,le=null,_e=null;return{setReversed:function(te){if(ce!==te){let fe=t.get("EXT_clip_control");if(te)fe.clipControlEXT(fe.LOWER_LEFT_EXT,fe.ZERO_TO_ONE_EXT);else fe.clipControlEXT(fe.LOWER_LEFT_EXT,fe.NEGATIVE_ONE_TO_ONE_EXT);ce=te;let ze=_e;_e=null,this.setClear(ze)}},getReversed:function(){return ce},setTest:function(te){if(te)se(e.DEPTH_TEST);else Pe(e.DEPTH_TEST)},setMask:function(te){if(J!==te&&!N)e.depthMask(te),J=te},setFunc:function(te){if(ce)te=cg[te];if(le!==te){switch(te){case Um:e.depthFunc(e.NEVER);break;case Om:e.depthFunc(e.ALWAYS);break;case Fm:e.depthFunc(e.LESS);break;case zc:e.depthFunc(e.LEQUAL);break;case zm:e.depthFunc(e.EQUAL);break;case km:e.depthFunc(e.GEQUAL);break;case Bm:e.depthFunc(e.GREATER);break;case Gm:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}le=te}},setLocked:function(te){N=te},setClear:function(te){if(_e!==te){if(_e=te,ce)te=1-te;e.clearDepth(te)}},reset:function(){N=!1,J=null,le=null,_e=null,ce=!1}}}function r(){let N=!1,ce=null,J=null,le=null,_e=null,te=null,fe=null,ze=null,ht=null;return{setTest:function(tt){if(!N)if(tt)se(e.STENCIL_TEST);else Pe(e.STENCIL_TEST)},setMask:function(tt){if(ce!==tt&&!N)e.stencilMask(tt),ce=tt},setFunc:function(tt,Cn,Zn){if(J!==tt||le!==Cn||_e!==Zn)e.stencilFunc(tt,Cn,Zn),J=tt,le=Cn,_e=Zn},setOp:function(tt,Cn,Zn){if(te!==tt||fe!==Cn||ze!==Zn)e.stencilOp(tt,Cn,Zn),te=tt,fe=Cn,ze=Zn},setLocked:function(tt){N=tt},setClear:function(tt){if(ht!==tt)e.clearStencil(tt),ht=tt},reset:function(){N=!1,ce=null,J=null,le=null,_e=null,te=null,fe=null,ze=null,ht=null}}}let s=new n,o=new i,a=new r,c=new WeakMap,l=new WeakMap,u={},d={},h={},f=new WeakMap,g=[],S=null,p=!1,m=null,T=null,A=null,v=null,w=null,E=null,R=null,x=new Re(0,0,0),M=0,H=!1,O=null,z=null,D=null,C=null,F=null,Z=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),G=!1,ie=0,X=e.getParameter(e.VERSION);if(X.indexOf("WebGL")!==-1)ie=parseFloat(/^WebGL (\d)/.exec(X)[1]),G=ie>=1;else if(X.indexOf("OpenGL ES")!==-1)ie=parseFloat(/^OpenGL ES (\d)/.exec(X)[1]),G=ie>=2;let Q=null,ee={},ve=e.getParameter(e.SCISSOR_BOX),Ee=e.getParameter(e.VIEWPORT),qe=new ot().fromArray(ve),ke=new ot().fromArray(Ee);function q(N,ce,J,le){let _e=new Uint8Array(4),te=e.createTexture();e.bindTexture(N,te),e.texParameteri(N,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(N,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let fe=0;fe<J;fe++)if(N===e.TEXTURE_3D||N===e.TEXTURE_2D_ARRAY)e.texImage3D(ce,0,e.RGBA,1,1,le,0,e.RGBA,e.UNSIGNED_BYTE,_e);else e.texImage2D(ce+fe,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,_e);return te}let re={};re[e.TEXTURE_2D]=q(e.TEXTURE_2D,e.TEXTURE_2D,1),re[e.TEXTURE_CUBE_MAP]=q(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),re[e.TEXTURE_2D_ARRAY]=q(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),re[e.TEXTURE_3D]=q(e.TEXTURE_3D,e.TEXTURE_3D,1,1),s.setClear(0,0,0,1),o.setClear(1),a.setClear(0),se(e.DEPTH_TEST),o.setFunc(zc),kt(!1),ft(Dc),se(e.CULL_FACE),it(Un);function se(N){if(u[N]!==!0)e.enable(N),u[N]=!0}function Pe(N){if(u[N]!==!1)e.disable(N),u[N]=!1}function De(N,ce){if(h[N]!==ce){if(e.bindFramebuffer(N,ce),h[N]=ce,N===e.DRAW_FRAMEBUFFER)h[e.FRAMEBUFFER]=ce;if(N===e.FRAMEBUFFER)h[e.DRAW_FRAMEBUFFER]=ce;return!0}return!1}function Ce(N,ce){let J=g,le=!1;if(N){if(J=f.get(ce),J===void 0)J=[],f.set(ce,J);let _e=N.textures;if(J.length!==_e.length||J[0]!==e.COLOR_ATTACHMENT0){for(let te=0,fe=_e.length;te<fe;te++)J[te]=e.COLOR_ATTACHMENT0+te;J.length=_e.length,le=!0}}else if(J[0]!==e.BACK)J[0]=e.BACK,le=!0;if(le)e.drawBuffers(J)}function Ct(N){if(S!==N)return e.useProgram(N),S=N,!0;return!1}let Xe={[Dr]:e.FUNC_ADD,[gm]:e.FUNC_SUBTRACT,[_m]:e.FUNC_REVERSE_SUBTRACT};Xe[xm]=e.MIN,Xe[vm]=e.MAX;let Ye={[ym]:e.ZERO,[Sm]:e.ONE,[bm]:e.SRC_COLOR,[wm]:e.SRC_ALPHA,[Im]:e.SRC_ALPHA_SATURATE,[Rm]:e.DST_COLOR,[Em]:e.DST_ALPHA,[Mm]:e.ONE_MINUS_SRC_COLOR,[Tm]:e.ONE_MINUS_SRC_ALPHA,[Cm]:e.ONE_MINUS_DST_COLOR,[Am]:e.ONE_MINUS_DST_ALPHA,[Pm]:e.CONSTANT_COLOR,[Lm]:e.ONE_MINUS_CONSTANT_COLOR,[Nm]:e.CONSTANT_ALPHA,[Dm]:e.ONE_MINUS_CONSTANT_ALPHA};function it(N,ce,J,le,_e,te,fe,ze,ht,tt){if(N===Un){if(p===!0)Pe(e.BLEND),p=!1;return}if(p===!1)se(e.BLEND),p=!0;if(N!==mm){if(N!==m||tt!==H){if(T!==Dr||w!==Dr)e.blendEquation(e.FUNC_ADD),T=Dr,w=Dr;if(tt)switch(N){case Ss:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Uc:e.blendFunc(e.ONE,e.ONE);break;case Oc:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case Fc:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:Ne("WebGLState: Invalid blending: ",N);break}else switch(N){case Ss:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Uc:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case Oc:Ne("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Fc:Ne("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ne("WebGLState: Invalid blending: ",N);break}A=null,v=null,E=null,R=null,x.set(0,0,0),M=0,m=N,H=tt}return}if(_e=_e||ce,te=te||J,fe=fe||le,ce!==T||_e!==w)e.blendEquationSeparate(Xe[ce],Xe[_e]),T=ce,w=_e;if(J!==A||le!==v||te!==E||fe!==R)e.blendFuncSeparate(Ye[J],Ye[le],Ye[te],Ye[fe]),A=J,v=le,E=te,R=fe;if(ze.equals(x)===!1||ht!==M)e.blendColor(ze.r,ze.g,ze.b,ht),x.copy(ze),M=ht;m=N,H=!1}function Je(N,ce){N.side===mn?Pe(e.CULL_FACE):se(e.CULL_FACE);let J=N.side===jt;if(ce)J=!J;kt(J),N.blending===Ss&&N.transparent===!1?it(Un):it(N.blending,N.blendEquation,N.blendSrc,N.blendDst,N.blendEquationAlpha,N.blendSrcAlpha,N.blendDstAlpha,N.blendColor,N.blendAlpha,N.premultipliedAlpha),o.setFunc(N.depthFunc),o.setTest(N.depthTest),o.setMask(N.depthWrite),s.setMask(N.colorWrite);let le=N.stencilWrite;if(a.setTest(le),le)a.setMask(N.stencilWriteMask),a.setFunc(N.stencilFunc,N.stencilRef,N.stencilFuncMask),a.setOp(N.stencilFail,N.stencilZFail,N.stencilZPass);It(N.polygonOffset,N.polygonOffsetFactor,N.polygonOffsetUnits),N.alphaToCoverage===!0?se(e.SAMPLE_ALPHA_TO_COVERAGE):Pe(e.SAMPLE_ALPHA_TO_COVERAGE)}function kt(N){if(O!==N){if(N)e.frontFace(e.CW);else e.frontFace(e.CCW);O=N}}function ft(N){if(N!==dm){if(se(e.CULL_FACE),N!==z)if(N===Dc)e.cullFace(e.BACK);else if(N===fm)e.cullFace(e.FRONT);else e.cullFace(e.FRONT_AND_BACK)}else Pe(e.CULL_FACE);z=N}function Yt(N){if(N!==D){if(G)e.lineWidth(N);D=N}}function It(N,ce,J){if(N){if(se(e.POLYGON_OFFSET_FILL),C!==ce||F!==J){if(C=ce,F=J,o.getReversed())ce=-ce;e.polygonOffset(ce,J)}}else Pe(e.POLYGON_OFFSET_FILL)}function Pt(N){if(N)se(e.SCISSOR_TEST);else Pe(e.SCISSOR_TEST)}function P(N){if(N===void 0)N=e.TEXTURE0+Z-1;if(Q!==N)e.activeTexture(N),Q=N}function Jt(N,ce,J){if(J===void 0)if(Q===null)J=e.TEXTURE0+Z-1;else J=Q;let le=ee[J];if(le===void 0)le={type:void 0,texture:void 0},ee[J]=le;if(le.type!==N||le.texture!==ce){if(Q!==J)e.activeTexture(J),Q=J;e.bindTexture(N,ce||re[N]),le.type=N,le.texture=ce}}function et(){let N=ee[Q];if(N!==void 0&&N.type!==void 0)e.bindTexture(N.type,null),N.type=void 0,N.texture=void 0}function vt(){try{e.compressedTexImage2D(...arguments)}catch(N){Ne("WebGLState:",N)}}function b(){try{e.compressedTexImage3D(...arguments)}catch(N){Ne("WebGLState:",N)}}function _(){try{e.texSubImage2D(...arguments)}catch(N){Ne("WebGLState:",N)}}function I(){try{e.texSubImage3D(...arguments)}catch(N){Ne("WebGLState:",N)}}function V(){try{e.compressedTexSubImage2D(...arguments)}catch(N){Ne("WebGLState:",N)}}function ne(){try{e.compressedTexSubImage3D(...arguments)}catch(N){Ne("WebGLState:",N)}}function ae(){try{e.texStorage2D(...arguments)}catch(N){Ne("WebGLState:",N)}}function ue(){try{e.texStorage3D(...arguments)}catch(N){Ne("WebGLState:",N)}}function Y(){try{e.texImage2D(...arguments)}catch(N){Ne("WebGLState:",N)}}function j(){try{e.texImage3D(...arguments)}catch(N){Ne("WebGLState:",N)}}function ge(N){if(d[N]!==void 0)return d[N];else return e.getParameter(N)}function we(N,ce){if(d[N]!==ce)e.pixelStorei(N,ce),d[N]=ce}function he(N){if(qe.equals(N)===!1)e.scissor(N.x,N.y,N.z,N.w),qe.copy(N)}function oe(N){if(ke.equals(N)===!1)e.viewport(N.x,N.y,N.z,N.w),ke.copy(N)}function Ie(N,ce){let J=l.get(ce);if(J===void 0)J=new WeakMap,l.set(ce,J);let le=J.get(N);if(le===void 0)le=e.getUniformBlockIndex(ce,N.name),J.set(N,le)}function Le(N,ce){let le=l.get(ce).get(N);if(c.get(ce)!==le)e.uniformBlockBinding(ce,le,N.__bindingPointIndex),c.set(ce,le)}function je(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),u={},d={},Q=null,ee={},h={},f=new WeakMap,g=[],S=null,p=!1,m=null,T=null,A=null,v=null,w=null,E=null,R=null,x=new Re(0,0,0),M=0,H=!1,O=null,z=null,D=null,C=null,F=null,qe.set(0,0,e.canvas.width,e.canvas.height),ke.set(0,0,e.canvas.width,e.canvas.height),s.reset(),o.reset(),a.reset()}return{buffers:{color:s,depth:o,stencil:a},enable:se,disable:Pe,bindFramebuffer:De,drawBuffers:Ce,useProgram:Ct,setBlending:it,setMaterial:Je,setFlipSided:kt,setCullFace:ft,setLineWidth:Yt,setPolygonOffset:It,setScissorTest:Pt,activeTexture:P,bindTexture:Jt,unbindTexture:et,compressedTexImage2D:vt,compressedTexImage3D:b,texImage2D:Y,texImage3D:j,pixelStorei:we,getParameter:ge,updateUBOMapping:Ie,uniformBlockBinding:Le,texStorage2D:ae,texStorage3D:ue,texSubImage2D:_,texSubImage3D:I,compressedTexSubImage2D:V,compressedTexSubImage3D:ne,scissor:he,viewport:oe,reset:je}}function ZM(e,t,n,i,r,s,o){let a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new Ue,u=new WeakMap,d=new Set,h,f=new WeakMap,g=!1;try{g=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch(b){}function S(b,_){return g?new OffscreenCanvas(b,_):Pr("canvas")}function p(b,_,I){let V=1,ne=vt(b);if(ne.width>I||ne.height>I)V=I/Math.max(ne.width,ne.height);if(V<1)if(typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&b instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&b instanceof ImageBitmap||typeof VideoFrame<"u"&&b instanceof VideoFrame){let ae=Math.floor(V*ne.width),ue=Math.floor(V*ne.height);if(h===void 0)h=S(ae,ue);let Y=_?S(ae,ue):h;return Y.width=ae,Y.height=ue,Y.getContext("2d").drawImage(b,0,0,ae,ue),Te("WebGLRenderer: Texture has been resized from ("+ne.width+"x"+ne.height+") to ("+ae+"x"+ue+")."),Y}else{if("data"in b)Te("WebGLRenderer: Image in DataTexture is too big ("+ne.width+"x"+ne.height+").");return b}return b}function m(b){return b.generateMipmaps}function T(b){e.generateMipmap(b)}function A(b){if(b.isWebGLCubeRenderTarget)return e.TEXTURE_CUBE_MAP;if(b.isWebGL3DRenderTarget)return e.TEXTURE_3D;if(b.isWebGLArrayRenderTarget||b.isCompressedArrayTexture)return e.TEXTURE_2D_ARRAY;return e.TEXTURE_2D}function v(b,_,I,V,ne,ae=!1){if(b!==null){if(e[b]!==void 0)return e[b];Te("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+b+"'")}let ue;if(V){if(ue=t.get("EXT_texture_norm16"),!ue)Te("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension")}let Y=_;if(_===e.RED){if(I===e.FLOAT)Y=e.R32F;if(I===e.HALF_FLOAT)Y=e.R16F;if(I===e.UNSIGNED_BYTE)Y=e.R8;if(I===e.UNSIGNED_SHORT&&ue)Y=ue.R16_EXT;if(I===e.SHORT&&ue)Y=ue.R16_SNORM_EXT}if(_===e.RED_INTEGER){if(I===e.UNSIGNED_BYTE)Y=e.R8UI;if(I===e.UNSIGNED_SHORT)Y=e.R16UI;if(I===e.UNSIGNED_INT)Y=e.R32UI;if(I===e.BYTE)Y=e.R8I;if(I===e.SHORT)Y=e.R16I;if(I===e.INT)Y=e.R32I}if(_===e.RG){if(I===e.FLOAT)Y=e.RG32F;if(I===e.HALF_FLOAT)Y=e.RG16F;if(I===e.UNSIGNED_BYTE)Y=e.RG8;if(I===e.UNSIGNED_SHORT&&ue)Y=ue.RG16_EXT;if(I===e.SHORT&&ue)Y=ue.RG16_SNORM_EXT}if(_===e.RG_INTEGER){if(I===e.UNSIGNED_BYTE)Y=e.RG8UI;if(I===e.UNSIGNED_SHORT)Y=e.RG16UI;if(I===e.UNSIGNED_INT)Y=e.RG32UI;if(I===e.BYTE)Y=e.RG8I;if(I===e.SHORT)Y=e.RG16I;if(I===e.INT)Y=e.RG32I}if(_===e.RGB_INTEGER){if(I===e.UNSIGNED_BYTE)Y=e.RGB8UI;if(I===e.UNSIGNED_SHORT)Y=e.RGB16UI;if(I===e.UNSIGNED_INT)Y=e.RGB32UI;if(I===e.BYTE)Y=e.RGB8I;if(I===e.SHORT)Y=e.RGB16I;if(I===e.INT)Y=e.RGB32I}if(_===e.RGBA_INTEGER){if(I===e.UNSIGNED_BYTE)Y=e.RGBA8UI;if(I===e.UNSIGNED_SHORT)Y=e.RGBA16UI;if(I===e.UNSIGNED_INT)Y=e.RGBA32UI;if(I===e.BYTE)Y=e.RGBA8I;if(I===e.SHORT)Y=e.RGBA16I;if(I===e.INT)Y=e.RGBA32I}if(_===e.RGB){if(I===e.UNSIGNED_SHORT&&ue)Y=ue.RGB16_EXT;if(I===e.SHORT&&ue)Y=ue.RGB16_SNORM_EXT;if(I===e.UNSIGNED_INT_5_9_9_9_REV)Y=e.RGB9_E5;if(I===e.UNSIGNED_INT_10F_11F_11F_REV)Y=e.R11F_G11F_B10F}if(_===e.RGBA){let j=ae?Ll:He.getTransfer(ne);if(I===e.FLOAT)Y=e.RGBA32F;if(I===e.HALF_FLOAT)Y=e.RGBA16F;if(I===e.UNSIGNED_BYTE)Y=j===ut?e.SRGB8_ALPHA8:e.RGBA8;if(I===e.UNSIGNED_SHORT&&ue)Y=ue.RGBA16_EXT;if(I===e.SHORT&&ue)Y=ue.RGBA16_SNORM_EXT;if(I===e.UNSIGNED_SHORT_4_4_4_4)Y=e.RGBA4;if(I===e.UNSIGNED_SHORT_5_5_5_1)Y=e.RGB5_A1}if(Y===e.R16F||Y===e.R32F||Y===e.RG16F||Y===e.RG32F||Y===e.RGBA16F||Y===e.RGBA32F)t.get("EXT_color_buffer_float");return Y}function w(b,_){let I;if(b){if(_===null||_===wi||_===kr)I=e.DEPTH24_STENCIL8;else if(_===si)I=e.DEPTH32F_STENCIL8;else if(_===Ms)I=e.DEPTH24_STENCIL8,Te("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")}else if(_===null||_===wi||_===kr)I=e.DEPTH_COMPONENT24;else if(_===si)I=e.DEPTH_COMPONENT32F;else if(_===Ms)I=e.DEPTH_COMPONENT16;return I}function E(b,_){if(m(b)===!0||b.isFramebufferTexture&&b.minFilter!==Tn&&b.minFilter!==zt)return Math.log2(Math.max(_.width,_.height))+1;else if(b.mipmaps!==void 0&&b.mipmaps.length>0)return b.mipmaps.length;else if(b.isCompressedTexture&&Array.isArray(b.image))return _.mipmaps.length;else return 1}function R(b){let _=b.target;if(_.removeEventListener("dispose",R),M(_),_.isVideoTexture)u.delete(_);if(_.isHTMLTexture)d.delete(_)}function x(b){let _=b.target;_.removeEventListener("dispose",x),O(_)}function M(b){let _=i.get(b);if(_.__webglInit===void 0)return;let I=b.source,V=f.get(I);if(V){let ne=V[_.__cacheKey];if(ne.usedTimes--,ne.usedTimes===0)H(b);if(Object.keys(V).length===0)f.delete(I)}i.remove(b)}function H(b){let _=i.get(b);e.deleteTexture(_.__webglTexture);let I=b.source,V=f.get(I);delete V[_.__cacheKey],o.memory.textures--}function O(b){let _=i.get(b);if(b.depthTexture)b.depthTexture.dispose(),i.remove(b.depthTexture);if(b.isWebGLCubeRenderTarget)for(let V=0;V<6;V++){if(Array.isArray(_.__webglFramebuffer[V]))for(let ne=0;ne<_.__webglFramebuffer[V].length;ne++)e.deleteFramebuffer(_.__webglFramebuffer[V][ne]);else e.deleteFramebuffer(_.__webglFramebuffer[V]);if(_.__webglDepthbuffer)e.deleteRenderbuffer(_.__webglDepthbuffer[V])}else{if(Array.isArray(_.__webglFramebuffer))for(let V=0;V<_.__webglFramebuffer.length;V++)e.deleteFramebuffer(_.__webglFramebuffer[V]);else e.deleteFramebuffer(_.__webglFramebuffer);if(_.__webglDepthbuffer)e.deleteRenderbuffer(_.__webglDepthbuffer);if(_.__webglMultisampledFramebuffer)e.deleteFramebuffer(_.__webglMultisampledFramebuffer);if(_.__webglColorRenderbuffer){for(let V=0;V<_.__webglColorRenderbuffer.length;V++)if(_.__webglColorRenderbuffer[V])e.deleteRenderbuffer(_.__webglColorRenderbuffer[V])}if(_.__webglDepthRenderbuffer)e.deleteRenderbuffer(_.__webglDepthRenderbuffer)}let I=b.textures;for(let V=0,ne=I.length;V<ne;V++){let ae=i.get(I[V]);if(ae.__webglTexture)e.deleteTexture(ae.__webglTexture),o.memory.textures--;i.remove(I[V])}i.remove(b)}let z=0;function D(){z=0}function C(){return z}function F(b){z=b}function Z(){let b=z;if(b>=r.maxTextures)Te("WebGLTextures: Trying to use "+(b+1)+" texture units while this GPU supports only "+r.maxTextures);return z+=1,b}function G(b){let _=[];return _.push(b.wrapS),_.push(b.wrapT),_.push(b.wrapR||0),_.push(b.magFilter),_.push(b.minFilter),_.push(b.anisotropy),_.push(b.internalFormat),_.push(b.format),_.push(b.type),_.push(b.generateMipmaps),_.push(b.premultiplyAlpha),_.push(b.flipY),_.push(b.unpackAlignment),_.push(b.colorSpace),_.join()}function ie(b,_){let I=i.get(b);if(b.isVideoTexture)Jt(b);if(b.isRenderTargetTexture===!1&&b.isExternalTexture!==!0&&b.version>0&&I.__version!==b.version){let V=b.image;if(V===null)Te("WebGLRenderer: Texture marked for update but no image data found.");else if(V.complete===!1)Te("WebGLRenderer: Texture marked for update but image is incomplete");else{Pe(I,b,_);return}}else if(b.isExternalTexture)I.__webglTexture=b.sourceTexture?b.sourceTexture:null;n.bindTexture(e.TEXTURE_2D,I.__webglTexture,e.TEXTURE0+_)}function X(b,_){let I=i.get(b);if(b.isRenderTargetTexture===!1&&b.version>0&&I.__version!==b.version){Pe(I,b,_);return}else if(b.isExternalTexture)I.__webglTexture=b.sourceTexture?b.sourceTexture:null;n.bindTexture(e.TEXTURE_2D_ARRAY,I.__webglTexture,e.TEXTURE0+_)}function Q(b,_){let I=i.get(b);if(b.isRenderTargetTexture===!1&&b.version>0&&I.__version!==b.version){Pe(I,b,_);return}n.bindTexture(e.TEXTURE_3D,I.__webglTexture,e.TEXTURE0+_)}function ee(b,_){let I=i.get(b);if(b.isCubeDepthTexture!==!0&&b.version>0&&I.__version!==b.version){De(I,b,_);return}n.bindTexture(e.TEXTURE_CUBE_MAP,I.__webglTexture,e.TEXTURE0+_)}let ve={[Or]:e.REPEAT,[Fr]:e.CLAMP_TO_EDGE,[Jo]:e.MIRRORED_REPEAT},Ee={[Tn]:e.NEAREST,[Ko]:e.NEAREST_MIPMAP_NEAREST,[Xi]:e.NEAREST_MIPMAP_LINEAR,[zt]:e.LINEAR,[zr]:e.LINEAR_MIPMAP_NEAREST,[On]:e.LINEAR_MIPMAP_LINEAR},qe={[Qm]:e.NEVER,[rg]:e.ALWAYS,[eg]:e.LESS,[sa]:e.LEQUAL,[tg]:e.EQUAL,[oa]:e.GEQUAL,[ng]:e.GREATER,[ig]:e.NOTEQUAL};function ke(b,_){if(_.type===si&&t.has("OES_texture_float_linear")===!1&&(_.magFilter===zt||_.magFilter===zr||_.magFilter===Xi||_.magFilter===On||_.minFilter===zt||_.minFilter===zr||_.minFilter===Xi||_.minFilter===On))Te("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.");if(e.texParameteri(b,e.TEXTURE_WRAP_S,ve[_.wrapS]),e.texParameteri(b,e.TEXTURE_WRAP_T,ve[_.wrapT]),b===e.TEXTURE_3D||b===e.TEXTURE_2D_ARRAY)e.texParameteri(b,e.TEXTURE_WRAP_R,ve[_.wrapR]);if(e.texParameteri(b,e.TEXTURE_MAG_FILTER,Ee[_.magFilter]),e.texParameteri(b,e.TEXTURE_MIN_FILTER,Ee[_.minFilter]),_.compareFunction)e.texParameteri(b,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(b,e.TEXTURE_COMPARE_FUNC,qe[_.compareFunction]);if(t.has("EXT_texture_filter_anisotropic")===!0){if(_.magFilter===Tn)return;if(_.minFilter!==Xi&&_.minFilter!==On)return;if(_.type===si&&t.has("OES_texture_float_linear")===!1)return;if(_.anisotropy>1||i.get(_).__currentAnisotropy){let I=t.get("EXT_texture_filter_anisotropic");e.texParameterf(b,I.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(_.anisotropy,r.getMaxAnisotropy())),i.get(_).__currentAnisotropy=_.anisotropy}}}function q(b,_){let I=!1;if(b.__webglInit===void 0)b.__webglInit=!0,_.addEventListener("dispose",R);let V=_.source,ne=f.get(V);if(ne===void 0)ne={},f.set(V,ne);let ae=G(_);if(ae!==b.__cacheKey){if(ne[ae]===void 0)ne[ae]={texture:e.createTexture(),usedTimes:0},o.memory.textures++,I=!0;ne[ae].usedTimes++;let ue=ne[b.__cacheKey];if(ue!==void 0){if(ne[b.__cacheKey].usedTimes--,ue.usedTimes===0)H(_)}b.__cacheKey=ae,b.__webglTexture=ne[ae].texture}return I}function re(b,_,I){return Math.floor(Math.floor(b/I)/_)}function se(b,_,I,V){let ae=b.updateRanges;if(ae.length===0)n.texSubImage2D(e.TEXTURE_2D,0,0,0,_.width,_.height,I,V,_.data);else{ae.sort((we,he)=>we.start-he.start);let ue=0;for(let we=1;we<ae.length;we++){let he=ae[ue],oe=ae[we],Ie=he.start+he.count,Le=re(oe.start,_.width,4),je=re(he.start,_.width,4);if(oe.start<=Ie+1&&Le===je&&re(oe.start+oe.count-1,_.width,4)===Le)he.count=Math.max(he.count,oe.start+oe.count-he.start);else++ue,ae[ue]=oe}ae.length=ue+1;let Y=n.getParameter(e.UNPACK_ROW_LENGTH),j=n.getParameter(e.UNPACK_SKIP_PIXELS),ge=n.getParameter(e.UNPACK_SKIP_ROWS);n.pixelStorei(e.UNPACK_ROW_LENGTH,_.width);for(let we=0,he=ae.length;we<he;we++){let oe=ae[we],Ie=Math.floor(oe.start/4),Le=Math.ceil(oe.count/4),je=Ie%_.width,N=Math.floor(Ie/_.width),ce=Le,J=1;n.pixelStorei(e.UNPACK_SKIP_PIXELS,je),n.pixelStorei(e.UNPACK_SKIP_ROWS,N),n.texSubImage2D(e.TEXTURE_2D,0,je,N,ce,1,I,V,_.data)}b.clearUpdateRanges(),n.pixelStorei(e.UNPACK_ROW_LENGTH,Y),n.pixelStorei(e.UNPACK_SKIP_PIXELS,j),n.pixelStorei(e.UNPACK_SKIP_ROWS,ge)}}function Pe(b,_,I){let V=e.TEXTURE_2D;if(_.isDataArrayTexture||_.isCompressedArrayTexture)V=e.TEXTURE_2D_ARRAY;if(_.isData3DTexture)V=e.TEXTURE_3D;let ne=q(b,_),ae=_.source;n.bindTexture(V,b.__webglTexture,e.TEXTURE0+I);let ue=i.get(ae);if(ae.version!==ue.__version||ne===!0){if(n.activeTexture(e.TEXTURE0+I),(typeof ImageBitmap<"u"&&_.image instanceof ImageBitmap)===!1){let J=He.getPrimaries(He.workingColorSpace),le=_.colorSpace===Ki?null:He.getPrimaries(_.colorSpace),_e=_.colorSpace===Ki||J===le?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,_.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,_e)}n.pixelStorei(e.UNPACK_ALIGNMENT,_.unpackAlignment);let j=p(_.image,!1,r.maxTextureSize);j=et(_,j);let ge=s.convert(_.format,_.colorSpace),we=s.convert(_.type),he=v(_.internalFormat,ge,we,_.normalized,_.colorSpace,_.isVideoTexture);ke(V,_);let oe,Ie=_.mipmaps,Le=_.isVideoTexture!==!0,je=ue.__version===void 0||ne===!0,N=ae.dataReady,ce=E(_,j);if(_.isDepthTexture){if(he=w(_.format===Yi,_.type),je)if(Le)n.texStorage2D(e.TEXTURE_2D,1,he,j.width,j.height);else n.texImage2D(e.TEXTURE_2D,0,he,j.width,j.height,0,ge,we,null)}else if(_.isDataTexture)if(Ie.length>0){if(Le&&je)n.texStorage2D(e.TEXTURE_2D,ce,he,Ie[0].width,Ie[0].height);for(let J=0,le=Ie.length;J<le;J++)if(oe=Ie[J],Le){if(N)n.texSubImage2D(e.TEXTURE_2D,J,0,0,oe.width,oe.height,ge,we,oe.data)}else n.texImage2D(e.TEXTURE_2D,J,he,oe.width,oe.height,0,ge,we,oe.data);_.generateMipmaps=!1}else if(Le){if(je)n.texStorage2D(e.TEXTURE_2D,ce,he,j.width,j.height);if(N)se(_,j,ge,we)}else n.texImage2D(e.TEXTURE_2D,0,he,j.width,j.height,0,ge,we,j.data);else if(_.isCompressedTexture)if(_.isCompressedArrayTexture){if(Le&&je)n.texStorage3D(e.TEXTURE_2D_ARRAY,ce,he,Ie[0].width,Ie[0].height,j.depth);for(let J=0,le=Ie.length;J<le;J++)if(oe=Ie[J],_.format!==zn)if(ge!==null)if(Le){if(N)if(_.layerUpdates.size>0){let _e=nu(oe.width,oe.height,_.format,_.type);for(let te of _.layerUpdates){let fe=oe.data.subarray(te*_e/oe.data.BYTES_PER_ELEMENT,(te+1)*_e/oe.data.BYTES_PER_ELEMENT);n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,J,0,0,te,oe.width,oe.height,1,ge,fe)}}else n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,J,0,0,0,oe.width,oe.height,j.depth,ge,oe.data)}else n.compressedTexImage3D(e.TEXTURE_2D_ARRAY,J,he,oe.width,oe.height,j.depth,0,oe.data,0,0);else Te("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else if(Le){if(N)n.texSubImage3D(e.TEXTURE_2D_ARRAY,J,0,0,0,oe.width,oe.height,j.depth,ge,we,oe.data)}else n.texImage3D(e.TEXTURE_2D_ARRAY,J,he,oe.width,oe.height,j.depth,0,ge,we,oe.data);if(_.layerUpdates.size>0)_.clearLayerUpdates()}else{if(Le&&je)n.texStorage2D(e.TEXTURE_2D,ce,he,Ie[0].width,Ie[0].height);for(let J=0,le=Ie.length;J<le;J++)if(oe=Ie[J],_.format!==zn)if(ge!==null)if(Le){if(N)n.compressedTexSubImage2D(e.TEXTURE_2D,J,0,0,oe.width,oe.height,ge,oe.data)}else n.compressedTexImage2D(e.TEXTURE_2D,J,he,oe.width,oe.height,0,oe.data);else Te("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else if(Le){if(N)n.texSubImage2D(e.TEXTURE_2D,J,0,0,oe.width,oe.height,ge,we,oe.data)}else n.texImage2D(e.TEXTURE_2D,J,he,oe.width,oe.height,0,ge,we,oe.data)}else if(_.isDataArrayTexture)if(Le){if(je)n.texStorage3D(e.TEXTURE_2D_ARRAY,ce,he,j.width,j.height,j.depth);if(N)if(_.layerUpdates.size>0){let J=nu(j.width,j.height,_.format,_.type);for(let le of _.layerUpdates){let _e=j.data.subarray(le*J/j.data.BYTES_PER_ELEMENT,(le+1)*J/j.data.BYTES_PER_ELEMENT);n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,le,j.width,j.height,1,ge,we,_e)}_.clearLayerUpdates()}else n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,j.width,j.height,j.depth,ge,we,j.data)}else n.texImage3D(e.TEXTURE_2D_ARRAY,0,he,j.width,j.height,j.depth,0,ge,we,j.data);else if(_.isData3DTexture)if(Le){if(je)n.texStorage3D(e.TEXTURE_3D,ce,he,j.width,j.height,j.depth);if(N)n.texSubImage3D(e.TEXTURE_3D,0,0,0,0,j.width,j.height,j.depth,ge,we,j.data)}else n.texImage3D(e.TEXTURE_3D,0,he,j.width,j.height,j.depth,0,ge,we,j.data);else if(_.isFramebufferTexture){if(je)if(Le)n.texStorage2D(e.TEXTURE_2D,ce,he,j.width,j.height);else{let J=j.width,le=j.height;for(let _e=0;_e<ce;_e++)n.texImage2D(e.TEXTURE_2D,_e,he,J,le,0,ge,we,null),J>>=1,le>>=1}}else if(_.isHTMLTexture){if("texElementImage2D"in e){let J=e.canvas;if(!J.hasAttribute("layoutsubtree"))J.setAttribute("layoutsubtree","true");if(j.parentNode!==J){J.appendChild(j),d.add(_),J.onpaint=(le)=>{let _e=le.changedElements;for(let te of d)if(_e.includes(te.image))te.needsUpdate=!0},J.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,j);else{let{RGBA:_e,RGBA:te,UNSIGNED_BYTE:fe}=e;e.texElementImage2D(e.TEXTURE_2D,0,_e,te,fe,j)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(Ie.length>0){if(Le&&je){let J=vt(Ie[0]);n.texStorage2D(e.TEXTURE_2D,ce,he,J.width,J.height)}for(let J=0,le=Ie.length;J<le;J++)if(oe=Ie[J],Le){if(N)n.texSubImage2D(e.TEXTURE_2D,J,0,0,ge,we,oe)}else n.texImage2D(e.TEXTURE_2D,J,he,ge,we,oe);_.generateMipmaps=!1}else if(Le){if(je){let J=vt(j);n.texStorage2D(e.TEXTURE_2D,ce,he,J.width,J.height)}if(N)n.texSubImage2D(e.TEXTURE_2D,0,0,0,ge,we,j)}else n.texImage2D(e.TEXTURE_2D,0,he,ge,we,j);if(m(_))T(V);if(ue.__version=ae.version,_.onUpdate)_.onUpdate(_)}b.__version=_.version}function De(b,_,I){if(_.image.length!==6)return;let V=q(b,_),ne=_.source;n.bindTexture(e.TEXTURE_CUBE_MAP,b.__webglTexture,e.TEXTURE0+I);let ae=i.get(ne);if(ne.version!==ae.__version||V===!0){n.activeTexture(e.TEXTURE0+I);let ue=He.getPrimaries(He.workingColorSpace),Y=_.colorSpace===Ki?null:He.getPrimaries(_.colorSpace),j=_.colorSpace===Ki||ue===Y?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,_.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),n.pixelStorei(e.UNPACK_ALIGNMENT,_.unpackAlignment),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,j);let ge=_.isCompressedTexture||_.image[0].isCompressedTexture,we=_.image[0]&&_.image[0].isDataTexture,he=[];for(let te=0;te<6;te++){if(!ge&&!we)he[te]=p(_.image[te],!0,r.maxCubemapSize);else he[te]=we?_.image[te].image:_.image[te];he[te]=et(_,he[te])}let oe=he[0],Ie=s.convert(_.format,_.colorSpace),Le=s.convert(_.type),je=v(_.internalFormat,Ie,Le,_.normalized,_.colorSpace),N=_.isVideoTexture!==!0,ce=ae.__version===void 0||V===!0,J=ne.dataReady,le=E(_,oe);ke(e.TEXTURE_CUBE_MAP,_);let _e;if(ge){if(N&&ce)n.texStorage2D(e.TEXTURE_CUBE_MAP,le,je,oe.width,oe.height);for(let te=0;te<6;te++){_e=he[te].mipmaps;for(let fe=0;fe<_e.length;fe++){let ze=_e[fe];if(_.format!==zn)if(Ie!==null)if(N){if(J)n.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe,0,0,ze.width,ze.height,Ie,ze.data)}else n.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe,je,ze.width,ze.height,0,ze.data);else Te("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()");else if(N){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe,0,0,ze.width,ze.height,Ie,Le,ze.data)}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe,je,ze.width,ze.height,0,Ie,Le,ze.data)}}}else{if(_e=_.mipmaps,N&&ce){if(_e.length>0)le++;let te=vt(he[0]);n.texStorage2D(e.TEXTURE_CUBE_MAP,le,je,te.width,te.height)}for(let te=0;te<6;te++)if(we){if(N){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,he[te].width,he[te].height,Ie,Le,he[te].data)}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,je,he[te].width,he[te].height,0,Ie,Le,he[te].data);for(let fe=0;fe<_e.length;fe++){let ht=_e[fe].image[te].image;if(N){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe+1,0,0,ht.width,ht.height,Ie,Le,ht.data)}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe+1,je,ht.width,ht.height,0,Ie,Le,ht.data)}}else{if(N){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,Ie,Le,he[te])}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,je,Ie,Le,he[te]);for(let fe=0;fe<_e.length;fe++){let ze=_e[fe];if(N){if(J)n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe+1,0,0,Ie,Le,ze.image[te])}else n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+te,fe+1,je,Ie,Le,ze.image[te])}}}if(m(_))T(e.TEXTURE_CUBE_MAP);if(ae.__version=ne.version,_.onUpdate)_.onUpdate(_)}b.__version=_.version}function Ce(b,_,I,V,ne,ae){let ue=s.convert(I.format,I.colorSpace),Y=s.convert(I.type),j=v(I.internalFormat,ue,Y,I.normalized,I.colorSpace),ge=i.get(_),we=i.get(I);if(we.__renderTarget=_,!ge.__hasExternalTextures){let he=Math.max(1,_.width>>ae),oe=Math.max(1,_.height>>ae);if(ne===e.TEXTURE_3D||ne===e.TEXTURE_2D_ARRAY)n.texImage3D(ne,ae,j,he,oe,_.depth,0,ue,Y,null);else n.texImage2D(ne,ae,j,he,oe,0,ue,Y,null)}if(n.bindFramebuffer(e.FRAMEBUFFER,b),P(_))a.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,V,ne,we.__webglTexture,0,Pt(_));else if(ne===e.TEXTURE_2D||ne>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&ne<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)e.framebufferTexture2D(e.FRAMEBUFFER,V,ne,we.__webglTexture,ae);n.bindFramebuffer(e.FRAMEBUFFER,null)}function Ct(b,_,I){if(e.bindRenderbuffer(e.RENDERBUFFER,b),_.depthBuffer){let V=_.depthTexture,ne=V&&V.isDepthTexture?V.type:null,ae=w(_.stencilBuffer,ne),ue=_.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(P(_))a.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Pt(_),ae,_.width,_.height);else if(I)e.renderbufferStorageMultisample(e.RENDERBUFFER,Pt(_),ae,_.width,_.height);else e.renderbufferStorage(e.RENDERBUFFER,ae,_.width,_.height);e.framebufferRenderbuffer(e.FRAMEBUFFER,ue,e.RENDERBUFFER,b)}else{let V=_.textures;for(let ne=0;ne<V.length;ne++){let ae=V[ne],ue=s.convert(ae.format,ae.colorSpace),Y=s.convert(ae.type),j=v(ae.internalFormat,ue,Y,ae.normalized,ae.colorSpace);if(P(_))a.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Pt(_),j,_.width,_.height);else if(I)e.renderbufferStorageMultisample(e.RENDERBUFFER,Pt(_),j,_.width,_.height);else e.renderbufferStorage(e.RENDERBUFFER,j,_.width,_.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function Xe(b,_,I){let V=_.isWebGLCubeRenderTarget===!0;if(n.bindFramebuffer(e.FRAMEBUFFER,b),!(_.depthTexture&&_.depthTexture.isDepthTexture))throw Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let ne=i.get(_.depthTexture);if(ne.__renderTarget=_,!ne.__webglTexture||_.depthTexture.image.width!==_.width||_.depthTexture.image.height!==_.height)_.depthTexture.image.width=_.width,_.depthTexture.image.height=_.height,_.depthTexture.needsUpdate=!0;if(V){if(ne.__webglInit===void 0)ne.__webglInit=!0,_.depthTexture.addEventListener("dispose",R);if(ne.__webglTexture===void 0){ne.__webglTexture=e.createTexture(),n.bindTexture(e.TEXTURE_CUBE_MAP,ne.__webglTexture),ke(e.TEXTURE_CUBE_MAP,_.depthTexture);let ge=s.convert(_.depthTexture.format),we=s.convert(_.depthTexture.type),he;if(_.depthTexture.format===qi)he=e.DEPTH_COMPONENT24;else if(_.depthTexture.format===Yi)he=e.DEPTH24_STENCIL8;for(let oe=0;oe<6;oe++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,he,_.width,_.height,0,ge,we,null)}}else ie(_.depthTexture,0);let ae=ne.__webglTexture,ue=Pt(_),Y=V?e.TEXTURE_CUBE_MAP_POSITIVE_X+I:e.TEXTURE_2D,j=_.depthTexture.format===Yi?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(_.depthTexture.format===qi)if(P(_))a.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,j,Y,ae,0,ue);else e.framebufferTexture2D(e.FRAMEBUFFER,j,Y,ae,0);else if(_.depthTexture.format===Yi)if(P(_))a.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,j,Y,ae,0,ue);else e.framebufferTexture2D(e.FRAMEBUFFER,j,Y,ae,0);else throw Error("THREE.WebGLTextures: Unknown depthTexture format.")}function Ye(b){let _=i.get(b),I=b.isWebGLCubeRenderTarget===!0;if(_.__boundDepthTexture!==b.depthTexture){let V=b.depthTexture;if(_.__depthDisposeCallback)_.__depthDisposeCallback();if(V){let ne=()=>{delete _.__boundDepthTexture,delete _.__depthDisposeCallback,V.removeEventListener("dispose",ne)};V.addEventListener("dispose",ne),_.__depthDisposeCallback=ne}_.__boundDepthTexture=V}if(b.depthTexture&&!_.__autoAllocateDepthBuffer)if(I)for(let V=0;V<6;V++)Xe(_.__webglFramebuffer[V],b,V);else{let V=b.texture.mipmaps;if(V&&V.length>0)Xe(_.__webglFramebuffer[0],b,0);else Xe(_.__webglFramebuffer,b,0)}else if(I){_.__webglDepthbuffer=[];for(let V=0;V<6;V++)if(n.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer[V]),_.__webglDepthbuffer[V]===void 0)_.__webglDepthbuffer[V]=e.createRenderbuffer(),Ct(_.__webglDepthbuffer[V],b,!1);else{let ne=b.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ae=_.__webglDepthbuffer[V];e.bindRenderbuffer(e.RENDERBUFFER,ae),e.framebufferRenderbuffer(e.FRAMEBUFFER,ne,e.RENDERBUFFER,ae)}}else{let V=b.texture.mipmaps;if(V&&V.length>0)n.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer[0]);else n.bindFramebuffer(e.FRAMEBUFFER,_.__webglFramebuffer);if(_.__webglDepthbuffer===void 0)_.__webglDepthbuffer=e.createRenderbuffer(),Ct(_.__webglDepthbuffer,b,!1);else{let ne=b.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ae=_.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,ae),e.framebufferRenderbuffer(e.FRAMEBUFFER,ne,e.RENDERBUFFER,ae)}}n.bindFramebuffer(e.FRAMEBUFFER,null)}function it(b,_,I){let V=i.get(b);if(_!==void 0)Ce(V.__webglFramebuffer,b,b.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0);if(I!==void 0)Ye(b)}function Je(b){let _=b.texture,I=i.get(b),V=i.get(_);b.addEventListener("dispose",x);let ne=b.textures,ae=b.isWebGLCubeRenderTarget===!0,ue=ne.length>1;if(!ue){if(V.__webglTexture===void 0)V.__webglTexture=e.createTexture();V.__version=_.version,o.memory.textures++}if(ae){I.__webglFramebuffer=[];for(let Y=0;Y<6;Y++)if(_.mipmaps&&_.mipmaps.length>0){I.__webglFramebuffer[Y]=[];for(let j=0;j<_.mipmaps.length;j++)I.__webglFramebuffer[Y][j]=e.createFramebuffer()}else I.__webglFramebuffer[Y]=e.createFramebuffer()}else{if(_.mipmaps&&_.mipmaps.length>0){I.__webglFramebuffer=[];for(let Y=0;Y<_.mipmaps.length;Y++)I.__webglFramebuffer[Y]=e.createFramebuffer()}else I.__webglFramebuffer=e.createFramebuffer();if(ue)for(let Y=0,j=ne.length;Y<j;Y++){let ge=i.get(ne[Y]);if(ge.__webglTexture===void 0)ge.__webglTexture=e.createTexture(),o.memory.textures++}if(b.samples>0&&P(b)===!1){I.__webglMultisampledFramebuffer=e.createFramebuffer(),I.__webglColorRenderbuffer=[],n.bindFramebuffer(e.FRAMEBUFFER,I.__webglMultisampledFramebuffer);for(let Y=0;Y<ne.length;Y++){let j=ne[Y];I.__webglColorRenderbuffer[Y]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,I.__webglColorRenderbuffer[Y]);let ge=s.convert(j.format,j.colorSpace),we=s.convert(j.type),he=v(j.internalFormat,ge,we,j.normalized,j.colorSpace,b.isXRRenderTarget===!0),oe=Pt(b);e.renderbufferStorageMultisample(e.RENDERBUFFER,oe,he,b.width,b.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+Y,e.RENDERBUFFER,I.__webglColorRenderbuffer[Y])}if(e.bindRenderbuffer(e.RENDERBUFFER,null),b.depthBuffer)I.__webglDepthRenderbuffer=e.createRenderbuffer(),Ct(I.__webglDepthRenderbuffer,b,!0);n.bindFramebuffer(e.FRAMEBUFFER,null)}}if(ae){n.bindTexture(e.TEXTURE_CUBE_MAP,V.__webglTexture),ke(e.TEXTURE_CUBE_MAP,_);for(let Y=0;Y<6;Y++)if(_.mipmaps&&_.mipmaps.length>0)for(let j=0;j<_.mipmaps.length;j++)Ce(I.__webglFramebuffer[Y][j],b,_,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,j);else Ce(I.__webglFramebuffer[Y],b,_,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0);if(m(_))T(e.TEXTURE_CUBE_MAP);n.unbindTexture()}else if(ue){for(let Y=0,j=ne.length;Y<j;Y++){let ge=ne[Y],we=i.get(ge),he=e.TEXTURE_2D;if(b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)he=b.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY;if(n.bindTexture(he,we.__webglTexture),ke(he,ge),Ce(I.__webglFramebuffer,b,ge,e.COLOR_ATTACHMENT0+Y,he,0),m(ge))T(he)}n.unbindTexture()}else{let Y=e.TEXTURE_2D;if(b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)Y=b.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY;if(n.bindTexture(Y,V.__webglTexture),ke(Y,_),_.mipmaps&&_.mipmaps.length>0)for(let j=0;j<_.mipmaps.length;j++)Ce(I.__webglFramebuffer[j],b,_,e.COLOR_ATTACHMENT0,Y,j);else Ce(I.__webglFramebuffer,b,_,e.COLOR_ATTACHMENT0,Y,0);if(m(_))T(Y);n.unbindTexture()}if(b.depthBuffer)Ye(b)}function kt(b){let _=b.textures;for(let I=0,V=_.length;I<V;I++){let ne=_[I];if(m(ne)){let ae=A(b),ue=i.get(ne).__webglTexture;n.bindTexture(ae,ue),T(ae),n.unbindTexture()}}}let ft=[],Yt=[];function It(b){if(b.samples>0){if(P(b)===!1){let{textures:_,width:I,height:V}=b,ne=e.COLOR_BUFFER_BIT,ae=b.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ue=i.get(b),Y=_.length>1;if(Y)for(let ge=0;ge<_.length;ge++)n.bindFramebuffer(e.FRAMEBUFFER,ue.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+ge,e.RENDERBUFFER,null),n.bindFramebuffer(e.FRAMEBUFFER,ue.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+ge,e.TEXTURE_2D,null,0);n.bindFramebuffer(e.READ_FRAMEBUFFER,ue.__webglMultisampledFramebuffer);let j=b.texture.mipmaps;if(j&&j.length>0)n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ue.__webglFramebuffer[0]);else n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ue.__webglFramebuffer);for(let ge=0;ge<_.length;ge++){if(b.resolveDepthBuffer){if(b.depthBuffer)ne|=e.DEPTH_BUFFER_BIT;if(b.stencilBuffer&&b.resolveStencilBuffer)ne|=e.STENCIL_BUFFER_BIT}if(Y){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,ue.__webglColorRenderbuffer[ge]);let we=i.get(_[ge]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,we,0)}if(e.blitFramebuffer(0,0,I,V,0,0,I,V,ne,e.NEAREST),c===!0){if(ft.length=0,Yt.length=0,ft.push(e.COLOR_ATTACHMENT0+ge),b.depthBuffer&&b.storeMultisampledDepthBuffer===!1)ft.push(ae),Yt.push(ae),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,Yt);e.invalidateFramebuffer(e.READ_FRAMEBUFFER,ft)}}if(n.bindFramebuffer(e.READ_FRAMEBUFFER,null),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),Y)for(let ge=0;ge<_.length;ge++){n.bindFramebuffer(e.FRAMEBUFFER,ue.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+ge,e.RENDERBUFFER,ue.__webglColorRenderbuffer[ge]);let we=i.get(_[ge]).__webglTexture;n.bindFramebuffer(e.FRAMEBUFFER,ue.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+ge,e.TEXTURE_2D,we,0)}n.bindFramebuffer(e.DRAW_FRAMEBUFFER,ue.__webglMultisampledFramebuffer)}else if(b.depthBuffer&&b.storeMultisampledDepthBuffer===!1&&c){let _=b.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[_])}}}function Pt(b){return Math.min(r.maxSamples,b.samples)}function P(b){let _=i.get(b);return b.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&_.__useRenderToTexture!==!1}function Jt(b){let _=o.render.frame;if(u.get(b)!==_)u.set(b,_),b.update()}function et(b,_){let{colorSpace:I,format:V,type:ne}=b;if(b.isCompressedTexture===!0||b.isVideoTexture===!0)return _;if(I!==on&&I!==Ki)if(He.getTransfer(I)===ut){if(V!==zn||ne!==En)Te("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.")}else Ne("WebGLTextures: Unsupported texture color space:",I);return _}function vt(b){if(typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement)l.width=b.naturalWidth||b.width,l.height=b.naturalHeight||b.height;else if(typeof VideoFrame<"u"&&b instanceof VideoFrame)l.width=b.displayWidth,l.height=b.displayHeight;else l.width=b.width,l.height=b.height;return l}this.allocateTextureUnit=Z,this.resetTextureUnits=D,this.getTextureUnits=C,this.setTextureUnits=F,this.setTexture2D=ie,this.setTexture2DArray=X,this.setTexture3D=Q,this.setTextureCube=ee,this.rebindTextures=it,this.setupRenderTarget=Je,this.updateRenderTargetMipmap=kt,this.updateMultisampleRenderTarget=It,this.setupDepthRenderbuffer=Ye,this.setupFrameBufferTexture=Ce,this.useMultisampledRTT=P,this.isReversedDepthBuffer=function(){return n.buffers.depth.getReversed()}}function XM(e,t){function n(i,r=Ki){let s,o=He.getTransfer(r);if(i===En)return e.UNSIGNED_BYTE;if(i===Xc)return e.UNSIGNED_SHORT_4_4_4_4;if(i===qc)return e.UNSIGNED_SHORT_5_5_5_1;if(i===Xm)return e.UNSIGNED_INT_5_9_9_9_REV;if(i===qm)return e.UNSIGNED_INT_10F_11F_11F_REV;if(i===$m)return e.BYTE;if(i===Zm)return e.SHORT;if(i===Ms)return e.UNSIGNED_SHORT;if(i===Zc)return e.INT;if(i===wi)return e.UNSIGNED_INT;if(i===si)return e.FLOAT;if(i===Fn)return e.HALF_FLOAT;if(i===Ym)return e.ALPHA;if(i===Jm)return e.RGB;if(i===zn)return e.RGBA;if(i===qi)return e.DEPTH_COMPONENT;if(i===Yi)return e.DEPTH_STENCIL;if(i===Km)return e.RED;if(i===Yc)return e.RED_INTEGER;if(i===Ji)return e.RG;if(i===Jc)return e.RG_INTEGER;if(i===Kc)return e.RGBA_INTEGER;if(i===jo||i===Qo||i===ea||i===ta)if(o===ut)if(s=t.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(i===jo)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===Qo)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===ea)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===ta)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=t.get("WEBGL_compressed_texture_s3tc"),s!==null){if(i===jo)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===Qo)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===ea)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===ta)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===jc||i===Qc||i===el||i===tl)if(s=t.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(i===jc)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===Qc)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===el)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===tl)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===nl||i===il||i===rl||i===sl||i===ol||i===na||i===al)if(s=t.get("WEBGL_compressed_texture_etc"),s!==null){if(i===nl||i===il)return o===ut?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(i===rl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC;if(i===sl)return s.COMPRESSED_R11_EAC;if(i===ol)return s.COMPRESSED_SIGNED_R11_EAC;if(i===na)return s.COMPRESSED_RG11_EAC;if(i===al)return s.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===cl||i===ll||i===ul||i===hl||i===dl||i===fl||i===pl||i===ml||i===gl||i===_l||i===xl||i===vl||i===yl||i===Sl)if(s=t.get("WEBGL_compressed_texture_astc"),s!==null){if(i===cl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===ll)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===ul)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===hl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===dl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===fl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===pl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===ml)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===gl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===_l)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===xl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===vl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===yl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===Sl)return o===ut?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===bl||i===Ml||i===wl)if(s=t.get("EXT_texture_compression_bptc"),s!==null){if(i===bl)return o===ut?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===Ml)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===wl)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===Tl||i===El||i===ia||i===Al)if(s=t.get("EXT_texture_compression_rgtc"),s!==null){if(i===Tl)return s.COMPRESSED_RED_RGTC1_EXT;if(i===El)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===ia)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===Al)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;if(i===kr)return e.UNSIGNED_INT_24_8;return e[i]!==void 0?e[i]:null}return{convert:n}}var qM=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,YM=`
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

}`;class Kg{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new pa(e.texture);if(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)this.depthNear=e.depthNear,this.depthFar=e.depthFar;this.texture=n}}getMesh(e){if(this.texture!==null){if(this.mesh===null){let t=e.cameras[0].viewport,n=new en({vertexShader:qM,fragmentShader:YM,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new xt(new Us(20,20),n)}}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class jg extends kn{constructor(e,t){super();let n=this,i=null,r=1,s=null,o="local-floor",a=1,c=null,l=null,u=null,d=null,h=null,f=null,g=typeof XRWebGLBinding<"u",S=new Kg,p={},m=t.getContextAttributes(),T=null,A=null,v=[],w=[],E=new Ue,R=null,x=null,M=new Lt;M.viewport=new ot;let H=new Lt;H.viewport=new ot;let O=[M,H],z=new Jl,D=null,C=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(q){let re=v[q];if(re===void 0)re=new As,v[q]=re;return re.getTargetRaySpace()},this.getControllerGrip=function(q){let re=v[q];if(re===void 0)re=new As,v[q]=re;return re.getGripSpace()},this.getHand=function(q){let re=v[q];if(re===void 0)re=new As,v[q]=re;return re.getHandSpace()};function F(q){let re=w.indexOf(q.inputSource);if(re===-1)return;let se=v[re];if(se!==void 0)se.update(q.inputSource,q.frame,c||s),se.dispatchEvent({type:q.type,data:q.inputSource})}function Z(){i.removeEventListener("select",F),i.removeEventListener("selectstart",F),i.removeEventListener("selectend",F),i.removeEventListener("squeeze",F),i.removeEventListener("squeezestart",F),i.removeEventListener("squeezeend",F),i.removeEventListener("end",Z),i.removeEventListener("inputsourceschange",G);for(let q=0;q<v.length;q++){let re=w[q];if(re===null)continue;w[q]=null,v[q].disconnect(re)}D=null,C=null,S.reset();for(let q in p)delete p[q];if(e.setRenderTarget(T),h=null,d=null,u=null,i=null,A=null,ke.stop(),n.isPresenting=!1,e.setPixelRatio(R),e.setSize(E.width,E.height,!1),x!==null){let q=x.camera;q.fov=x.fov,q.zoom=x.zoom,q.updateProjectionMatrix(),x=null}n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(q){if(r=q,n.isPresenting===!0)Te("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(q){if(o=q,n.isPresenting===!0)Te("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||s},this.setReferenceSpace=function(q){c=q},this.getBaseLayer=function(){return d!==null?d:h},this.getBinding=function(){if(u===null&&g)u=new XRWebGLBinding(i,t);return u},this.getFrame=function(){return f},this.getSession=function(){return i},this.setSession=async function(q){if(i=q,i!==null){if(T=e.getRenderTarget(),i.addEventListener("select",F),i.addEventListener("selectstart",F),i.addEventListener("selectend",F),i.addEventListener("squeeze",F),i.addEventListener("squeezestart",F),i.addEventListener("squeezeend",F),i.addEventListener("end",Z),i.addEventListener("inputsourceschange",G),m.xrCompatible!==!0)await t.makeXRCompatible();if(R=e.getPixelRatio(),e.getSize(E),!(g&&("createProjectionLayer"in XRWebGLBinding.prototype))){let se={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:r};h=new XRWebGLLayer(i,t,se),i.updateRenderState({baseLayer:h}),e.setPixelRatio(1),e.setSize(h.framebufferWidth,h.framebufferHeight,!1),A=new an(h.framebufferWidth,h.framebufferHeight,{format:zn,type:En,colorSpace:e.outputColorSpace,stencilBuffer:m.stencil,resolveDepthBuffer:h.ignoreDepthValues===!1,resolveStencilBuffer:h.ignoreDepthValues===!1,storeMultisampledDepthBuffer:h.ignoreDepthValues===!1,storeMultisampledStencilBuffer:h.ignoreDepthValues===!1})}else{let se=null,Pe=null,De=null;if(m.depth)De=m.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,se=m.stencil?Yi:qi,Pe=m.stencil?kr:wi;let Ce={colorFormat:t.RGBA8,depthFormat:De,scaleFactor:r};u=this.getBinding(),d=u.createProjectionLayer(Ce),i.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),A=new an(d.textureWidth,d.textureHeight,{format:zn,type:En,depthTexture:new Qi(d.textureWidth,d.textureHeight,Pe,void 0,void 0,void 0,void 0,void 0,void 0,se),stencilBuffer:m.stencil,colorSpace:e.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}A.isXRRenderTarget=!0,this.setFoveation(a),c=null,s=await i.requestReferenceSpace(o),ke.setContext(i),ke.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return S.getDepthTexture()};function G(q){for(let re=0;re<q.removed.length;re++){let se=q.removed[re],Pe=w.indexOf(se);if(Pe>=0)w[Pe]=null,v[Pe].disconnect(se)}for(let re=0;re<q.added.length;re++){let se=q.added[re],Pe=w.indexOf(se);if(Pe===-1){for(let Ce=0;Ce<v.length;Ce++)if(Ce>=w.length){w.push(se),Pe=Ce;break}else if(w[Ce]===null){w[Ce]=se,Pe=Ce;break}if(Pe===-1)break}let De=v[Pe];if(De)De.connect(se)}}let ie=new U,X=new U;function Q(q,re,se){ie.setFromMatrixPosition(re.matrixWorld),X.setFromMatrixPosition(se.matrixWorld);let Pe=ie.distanceTo(X),De=re.projectionMatrix.elements,Ce=se.projectionMatrix.elements,Ct=De[14]/(De[10]-1),Xe=De[14]/(De[10]+1),Ye=(De[9]+1)/De[5],it=(De[9]-1)/De[5],Je=(De[8]-1)/De[0],kt=(Ce[8]+1)/Ce[0],ft=Ct*Je,Yt=Ct*kt,It=Pe/(-Je+kt),Pt=It*-Je;if(re.matrixWorld.decompose(q.position,q.quaternion,q.scale),q.translateX(Pt),q.translateZ(It),q.matrixWorld.compose(q.position,q.quaternion,q.scale),q.matrixWorldInverse.copy(q.matrixWorld).invert(),De[10]===-1)q.projectionMatrix.copy(re.projectionMatrix),q.projectionMatrixInverse.copy(re.projectionMatrixInverse);else{let P=Ct+It,Jt=Xe+It,et=ft-Pt,vt=Yt+(Pe-Pt),b=Ye*Xe/Jt*P,_=it*Xe/Jt*P;q.projectionMatrix.makePerspective(et,vt,b,_,P,Jt),q.projectionMatrixInverse.copy(q.projectionMatrix).invert()}}function ee(q,re){if(re===null)q.matrixWorld.copy(q.matrix);else q.matrixWorld.multiplyMatrices(re.matrixWorld,q.matrix);q.matrixWorldInverse.copy(q.matrixWorld).invert()}this.updateCamera=function(q){if(i===null)return;let{near:re,far:se}=q;if(S.texture!==null){if(S.depthNear>0)re=S.depthNear;if(S.depthFar>0)se=S.depthFar}if(z.near=H.near=M.near=re,z.far=H.far=M.far=se,D!==z.near||C!==z.far)i.updateRenderState({depthNear:z.near,depthFar:z.far}),D=z.near,C=z.far;z.layers.mask=q.layers.mask|6,M.layers.mask=z.layers.mask&-5,H.layers.mask=z.layers.mask&-3;let Pe=q.parent,De=z.cameras;ee(z,Pe);for(let Ce=0;Ce<De.length;Ce++)ee(De[Ce],Pe);if(De.length===2)Q(z,M,H);else z.projectionMatrix.copy(M.projectionMatrix);if(x===null&&q.isPerspectiveCamera)x={camera:q,fov:q.fov,zoom:q.zoom};ve(q,z,Pe)};function ve(q,re,se){if(se===null)q.matrix.copy(re.matrixWorld);else q.matrix.copy(se.matrixWorld),q.matrix.invert(),q.matrix.multiply(re.matrixWorld);if(q.matrix.decompose(q.position,q.quaternion,q.scale),q.updateMatrixWorld(!0),q.projectionMatrix.copy(re.projectionMatrix),q.projectionMatrixInverse.copy(re.projectionMatrixInverse),q.isPerspectiveCamera)q.fov=$i*2*Math.atan(1/q.projectionMatrix.elements[5]),q.zoom=1}this.getCamera=function(){return z},this.getFoveation=function(){if(d===null&&h===null)return;return a},this.setFoveation=function(q){if(a=q,d!==null)d.fixedFoveation=q;if(h!==null&&h.fixedFoveation!==void 0)h.fixedFoveation=q},this.hasDepthSensing=function(){return S.texture!==null},this.getDepthSensingMesh=function(){return S.getMesh(z)},this.getCameraTexture=function(q){return p[q]};let Ee=null;function qe(q,re){if(l=re.getViewerPose(c||s),f=re,l!==null){let se=l.views;if(h!==null)e.setRenderTargetFramebuffer(A,h.framebuffer),e.setRenderTarget(A);let Pe=!1;if(se.length!==z.cameras.length)z.cameras.length=0,Pe=!0;for(let Xe=0;Xe<se.length;Xe++){let Ye=se[Xe],it=null;if(h!==null)it=h.getViewport(Ye);else{let kt=u.getViewSubImage(d,Ye);if(it=kt.viewport,Xe===0)e.setRenderTargetTextures(A,kt.colorTexture,kt.depthStencilTexture),e.setRenderTarget(A)}let Je=O[Xe];if(Je===void 0)Je=new Lt,Je.layers.enable(Xe),Je.viewport=new ot,O[Xe]=Je;if(Je.matrix.fromArray(Ye.transform.matrix),Je.matrix.decompose(Je.position,Je.quaternion,Je.scale),Je.projectionMatrix.fromArray(Ye.projectionMatrix),Je.projectionMatrixInverse.copy(Je.projectionMatrix).invert(),Je.viewport.set(it.x,it.y,it.width,it.height),Xe===0)z.matrix.copy(Je.matrix),z.matrix.decompose(z.position,z.quaternion,z.scale);if(Pe===!0)z.cameras.push(Je)}let De=i.enabledFeatures;if(De&&De.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&g){u=n.getBinding();let Xe=u.getDepthInformation(se[0]);if(Xe&&Xe.isValid&&Xe.texture)S.init(Xe,i.renderState)}if(De&&De.includes("camera-access")&&g){e.state.unbindTexture(),u=n.getBinding();for(let Xe=0;Xe<se.length;Xe++){let Ye=se[Xe].camera;if(Ye){let it=p[Ye];if(!it)it=new pa,p[Ye]=it;let Je=u.getCameraImage(Ye);it.sourceTexture=Je}}}}for(let se=0;se<v.length;se++){let Pe=w[se],De=v[se];if(Pe!==null&&De!==void 0)De.update(Pe,re,c||s)}if(Ee)Ee(q,re);if(re.detectedPlanes)n.dispatchEvent({type:"planesdetected",data:re});f=null}let ke=new Bg;ke.setAnimationLoop(qe),this.setAnimationLoop=function(q){Ee=q},this.dispose=function(){}}}var JM=new Oe,Qg=new Fe;Qg.set(-1,0,0,0,1,0,0,0,1);function KM(e,t){function n(p,m){if(p.matrixAutoUpdate===!0)p.updateMatrix();m.value.copy(p.matrix)}function i(p,m){if(m.color.getRGB(p.fogColor.value,Gl(e)),m.isFog)p.fogNear.value=m.near,p.fogFar.value=m.far;else if(m.isFogExp2)p.fogDensity.value=m.density}function r(p,m,T,A,v){if(m.isNodeMaterial)m.uniformsNeedUpdate=!1;else if(m.isMeshBasicMaterial)s(p,m);else if(m.isMeshLambertMaterial){if(s(p,m),m.envMap)p.envMapIntensity.value=m.envMapIntensity}else if(m.isMeshToonMaterial)s(p,m),d(p,m);else if(m.isMeshPhongMaterial){if(s(p,m),u(p,m),m.envMap)p.envMapIntensity.value=m.envMapIntensity}else if(m.isMeshStandardMaterial){if(s(p,m),h(p,m),m.isMeshPhysicalMaterial)f(p,m,v)}else if(m.isMeshMatcapMaterial)s(p,m),g(p,m);else if(m.isMeshDepthMaterial)s(p,m);else if(m.isMeshDistanceMaterial)s(p,m),S(p,m);else if(m.isMeshNormalMaterial)s(p,m);else if(m.isLineBasicMaterial){if(o(p,m),m.isLineDashedMaterial)a(p,m)}else if(m.isPointsMaterial)c(p,m,T,A);else if(m.isSpriteMaterial)l(p,m);else if(m.isShadowMaterial)p.color.value.copy(m.color),p.opacity.value=m.opacity;else if(m.isShaderMaterial)m.uniformsNeedUpdate=!1}function s(p,m){if(p.opacity.value=m.opacity,m.color)p.diffuse.value.copy(m.color);if(m.emissive)p.emissive.value.copy(m.emissive).multiplyScalar(m.emissiveIntensity);if(m.map)p.map.value=m.map,n(m.map,p.mapTransform);if(m.alphaMap)p.alphaMap.value=m.alphaMap,n(m.alphaMap,p.alphaMapTransform);if(m.bumpMap){if(p.bumpMap.value=m.bumpMap,n(m.bumpMap,p.bumpMapTransform),p.bumpScale.value=m.bumpScale,m.side===jt)p.bumpScale.value*=-1}if(m.normalMap){if(p.normalMap.value=m.normalMap,n(m.normalMap,p.normalMapTransform),p.normalScale.value.copy(m.normalScale),m.side===jt)p.normalScale.value.negate()}if(m.displacementMap)p.displacementMap.value=m.displacementMap,n(m.displacementMap,p.displacementMapTransform),p.displacementScale.value=m.displacementScale,p.displacementBias.value=m.displacementBias;if(m.emissiveMap)p.emissiveMap.value=m.emissiveMap,n(m.emissiveMap,p.emissiveMapTransform);if(m.specularMap)p.specularMap.value=m.specularMap,n(m.specularMap,p.specularMapTransform);if(m.alphaTest>0)p.alphaTest.value=m.alphaTest;let T=t.get(m),{envMap:A,envMapRotation:v}=T;if(A){if(p.envMap.value=A,p.envMapRotation.value.setFromMatrix4(JM.makeRotationFromEuler(v)).transpose(),A.isCubeTexture&&A.isRenderTargetTexture===!1)p.envMapRotation.value.premultiply(Qg);p.reflectivity.value=m.reflectivity,p.ior.value=m.ior,p.refractionRatio.value=m.refractionRatio}if(m.lightMap)p.lightMap.value=m.lightMap,p.lightMapIntensity.value=m.lightMapIntensity,n(m.lightMap,p.lightMapTransform);if(m.aoMap)p.aoMap.value=m.aoMap,p.aoMapIntensity.value=m.aoMapIntensity,n(m.aoMap,p.aoMapTransform)}function o(p,m){if(p.diffuse.value.copy(m.color),p.opacity.value=m.opacity,m.map)p.map.value=m.map,n(m.map,p.mapTransform)}function a(p,m){p.dashSize.value=m.dashSize,p.totalSize.value=m.dashSize+m.gapSize,p.scale.value=m.scale}function c(p,m,T,A){if(p.diffuse.value.copy(m.color),p.opacity.value=m.opacity,p.size.value=m.size*T,p.scale.value=A*0.5,m.map)p.map.value=m.map,n(m.map,p.uvTransform);if(m.alphaMap)p.alphaMap.value=m.alphaMap,n(m.alphaMap,p.alphaMapTransform);if(m.alphaTest>0)p.alphaTest.value=m.alphaTest}function l(p,m){if(p.diffuse.value.copy(m.color),p.opacity.value=m.opacity,p.rotation.value=m.rotation,m.map)p.map.value=m.map,n(m.map,p.mapTransform);if(m.alphaMap)p.alphaMap.value=m.alphaMap,n(m.alphaMap,p.alphaMapTransform);if(m.alphaTest>0)p.alphaTest.value=m.alphaTest}function u(p,m){p.specular.value.copy(m.specular),p.shininess.value=Math.max(m.shininess,0.0001)}function d(p,m){if(m.gradientMap)p.gradientMap.value=m.gradientMap}function h(p,m){if(p.metalness.value=m.metalness,m.metalnessMap)p.metalnessMap.value=m.metalnessMap,n(m.metalnessMap,p.metalnessMapTransform);if(p.roughness.value=m.roughness,m.roughnessMap)p.roughnessMap.value=m.roughnessMap,n(m.roughnessMap,p.roughnessMapTransform);if(m.envMap)p.envMapIntensity.value=m.envMapIntensity}function f(p,m,T){if(p.ior.value=m.ior,m.sheen>0){if(p.sheenColor.value.copy(m.sheenColor).multiplyScalar(m.sheen),p.sheenRoughness.value=m.sheenRoughness,m.sheenColorMap)p.sheenColorMap.value=m.sheenColorMap,n(m.sheenColorMap,p.sheenColorMapTransform);if(m.sheenRoughnessMap)p.sheenRoughnessMap.value=m.sheenRoughnessMap,n(m.sheenRoughnessMap,p.sheenRoughnessMapTransform)}if(m.clearcoat>0){if(p.clearcoat.value=m.clearcoat,p.clearcoatRoughness.value=m.clearcoatRoughness,m.clearcoatMap)p.clearcoatMap.value=m.clearcoatMap,n(m.clearcoatMap,p.clearcoatMapTransform);if(m.clearcoatRoughnessMap)p.clearcoatRoughnessMap.value=m.clearcoatRoughnessMap,n(m.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform);if(m.clearcoatNormalMap){if(p.clearcoatNormalMap.value=m.clearcoatNormalMap,n(m.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(m.clearcoatNormalScale),m.side===jt)p.clearcoatNormalScale.value.negate()}}if(m.dispersion>0)p.dispersion.value=m.dispersion;if(m.retroreflectivity>0)p.retroreflectivity.value=m.retroreflectivity;if(m.iridescence>0){if(p.iridescence.value=m.iridescence,p.iridescenceIOR.value=m.iridescenceIOR,p.iridescenceThicknessMinimum.value=m.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=m.iridescenceThicknessRange[1],m.iridescenceMap)p.iridescenceMap.value=m.iridescenceMap,n(m.iridescenceMap,p.iridescenceMapTransform);if(m.iridescenceThicknessMap)p.iridescenceThicknessMap.value=m.iridescenceThicknessMap,n(m.iridescenceThicknessMap,p.iridescenceThicknessMapTransform)}if(m.transmission>0){if(p.transmission.value=m.transmission,p.transmissionSamplerMap.value=T.texture,p.transmissionSamplerSize.value.set(T.width,T.height),m.transmissionMap)p.transmissionMap.value=m.transmissionMap,n(m.transmissionMap,p.transmissionMapTransform);if(p.thickness.value=m.thickness,m.thicknessMap)p.thicknessMap.value=m.thicknessMap,n(m.thicknessMap,p.thicknessMapTransform);p.attenuationDistance.value=m.attenuationDistance,p.attenuationColor.value.copy(m.attenuationColor)}if(m.anisotropy>0){if(p.anisotropyVector.value.set(m.anisotropy*Math.cos(m.anisotropyRotation),m.anisotropy*Math.sin(m.anisotropyRotation)),m.anisotropyMap)p.anisotropyMap.value=m.anisotropyMap,n(m.anisotropyMap,p.anisotropyMapTransform)}if(p.specularIntensity.value=m.specularIntensity,p.specularColor.value.copy(m.specularColor),m.specularColorMap)p.specularColorMap.value=m.specularColorMap,n(m.specularColorMap,p.specularColorMapTransform);if(m.specularIntensityMap)p.specularIntensityMap.value=m.specularIntensityMap,n(m.specularIntensityMap,p.specularIntensityMapTransform)}function g(p,m){if(m.matcap)p.matcap.value=m.matcap}function S(p,m){let T=t.get(m).light;p.referencePosition.value.setFromMatrixPosition(T.matrixWorld),p.nearDistance.value=T.shadow.camera.near,p.farDistance.value=T.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:r}}function jM(e,t,n,i){let r={},s={},o=[],a=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(v,w){let E=w.program;i.uniformBlockBinding(v,E)}function l(v,w){let E=r[v.id];if(E===void 0)p(v),E=u(v),r[v.id]=E,v.addEventListener("dispose",T);let R=w.program;i.updateUBOMapping(v,R);let x=t.render.frame;if(s[v.id]!==x)h(v),s[v.id]=x}function u(v){let w=d();v.__bindingPointIndex=w;let E=e.createBuffer(),{__size:R,usage:x}=v;return e.bindBuffer(e.UNIFORM_BUFFER,E),e.bufferData(e.UNIFORM_BUFFER,R,x),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,w,E),E}function d(){for(let v=0;v<a;v++)if(o.indexOf(v)===-1)return o.push(v),v;return Ne("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function h(v){let w=r[v.id],{uniforms:E,__cache:R}=v;e.bindBuffer(e.UNIFORM_BUFFER,w);for(let x=0,M=E.length;x<M;x++){let H=E[x];if(Array.isArray(H))for(let O=0,z=H.length;O<z;O++)f(H[O],x,O,R);else f(H,x,0,R)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function f(v,w,E,R){if(S(v,w,E,R)===!0){let{__offset:x,value:M}=v;if(Array.isArray(M)){let H=0;for(let O=0;O<M.length;O++){let z=M[O],D=m(z);if(g(z,v.__data,H),typeof z!=="number"&&typeof z!=="boolean"&&!z.isMatrix3&&!ArrayBuffer.isView(z))H+=D.storage/Float32Array.BYTES_PER_ELEMENT}}else g(M,v.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,x,v.__data)}}function g(v,w,E){if(typeof v==="number"||typeof v==="boolean")w[0]=v;else if(v.isMatrix3)w[0]=v.elements[0],w[1]=v.elements[1],w[2]=v.elements[2],w[3]=0,w[4]=v.elements[3],w[5]=v.elements[4],w[6]=v.elements[5],w[7]=0,w[8]=v.elements[6],w[9]=v.elements[7],w[10]=v.elements[8],w[11]=0;else if(ArrayBuffer.isView(v))w.set(new v.constructor(v.buffer,v.byteOffset,w.length));else v.toArray(w,E)}function S(v,w,E,R){let x=v.value,M=w+"_"+E;if(R[M]===void 0){if(typeof x==="number"||typeof x==="boolean")R[M]=x;else if(ArrayBuffer.isView(x))R[M]=x.slice();else R[M]=x.clone();return!0}else{let H=R[M];if(typeof x==="number"||typeof x==="boolean"){if(H!==x)return R[M]=x,!0}else if(ArrayBuffer.isView(x))return!0;else if(H.equals(x)===!1)return H.copy(x),!0}return!1}function p(v){let w=v.uniforms,E=0,R=16;for(let M=0,H=w.length;M<H;M++){let O=Array.isArray(w[M])?w[M]:[w[M]];for(let z=0,D=O.length;z<D;z++){let C=O[z],F=Array.isArray(C.value)?C.value:[C.value];for(let Z=0,G=F.length;Z<G;Z++){let ie=F[Z],X=m(ie),Q=E%R,ee=Q%X.boundary,ve=Q+ee;if(E+=ee,ve!==0&&R-ve<X.storage)E+=R-ve;C.__data=new Float32Array(X.storage/Float32Array.BYTES_PER_ELEMENT),C.__offset=E,E+=X.storage}}}let x=E%R;if(x>0)E+=R-x;return v.__size=E,v.__cache={},this}function m(v){let w={boundary:0,storage:0};if(typeof v==="number"||typeof v==="boolean")w.boundary=4,w.storage=4;else if(v.isVector2)w.boundary=8,w.storage=8;else if(v.isVector3||v.isColor)w.boundary=16,w.storage=12;else if(v.isVector4)w.boundary=16,w.storage=16;else if(v.isMatrix3)w.boundary=48,w.storage=48;else if(v.isMatrix4)w.boundary=64,w.storage=64;else if(v.isTexture)Te("WebGLRenderer: Texture samplers can not be part of an uniforms group.");else if(ArrayBuffer.isView(v))w.boundary=16,w.storage=v.byteLength;else Te("WebGLRenderer: Unsupported uniform value type.",v);return w}function T(v){let w=v.target;w.removeEventListener("dispose",T);let E=o.indexOf(w.__bindingPointIndex);o.splice(E,1),e.deleteBuffer(r[w.id]),delete r[w.id],delete s[w.id]}function A(){for(let v in r)e.deleteBuffer(r[v]);o=[],r={},s={}}return{bind:c,update:l,dispose:A}}var QM=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),Vn=null;function ew(){if(Vn===null)Vn=new Is(QM,16,16,Ji,Fn),Vn.name="DFG_LUT",Vn.minFilter=zt,Vn.magFilter=zt,Vn.wrapS=Fr,Vn.wrapT=Fr,Vn.generateMipmaps=!1,Vn.needsUpdate=!0;return Vn}class fu{constructor(e={}){let{canvas:t=sg(),context:n=null,depth:i=!0,stencil:r=!1,alpha:s=!1,antialias:o=!1,premultipliedAlpha:a=!0,preserveDrawingBuffer:c=!1,powerPreference:l="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:d=!1,outputBufferType:h=En}=e;this.isWebGLRenderer=!0;let f;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");f=n.getContextAttributes().alpha}else f=s;let g=h,S=new Set([Kc,Jc,Yc]),p=new Set([En,wi,Ms,kr,Xc,qc]),m=new Uint32Array(4),T=new Int32Array(4),A=new U,v=null,w=null,E=[],R=[],x=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=wn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let M=this,H=!1,O=null,z=null,D=null,C=null;this._outputColorSpace=Ti;let F=0,Z=0,G=null,ie=-1,X=null,Q=new ot,ee=new ot,ve=null,Ee=new Re(0),qe=0,{width:ke,height:q}=t,re=1,se=null,Pe=null,De=new ot(0,0,ke,q),Ce=new ot(0,0,ke,q),Ct=!1,Xe=new Ls,Ye=!1,it=!1,Je=new Oe,kt=new U,ft=new ot,Yt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},It=!1;function Pt(){return G===null?re:1}let P=n;function Jt(y,L){return t.getContext(y,L)}let et,vt,b,_,I,V,ne,ae,ue,Y,j,ge,we,he,oe,Ie,Le,je,N,ce,J,le,_e;try{let y={alpha:!0,depth:i,stencil:r,antialias:o,premultipliedAlpha:a,preserveDrawingBuffer:c,powerPreference:l,failIfMajorPerformanceCaveat:u};if("setAttribute"in t)t.setAttribute("data-engine",`three.js r${hm}`);if(t.addEventListener("webglcontextlost",ze,!1),t.addEventListener("webglcontextrestored",ht,!1),t.addEventListener("webglcontextcreationerror",tt,!1),P===null){if(P=Jt("webgl2",y),P===null)if(Jt("webgl2"))throw Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.");else throw Error("THREE.WebGLRenderer: Error creating WebGL context.")}te()}catch(y){throw t.removeEventListener("webglcontextlost",ze,!1),t.removeEventListener("webglcontextrestored",ht,!1),t.removeEventListener("webglcontextcreationerror",tt,!1),Ne("WebGLRenderer: "+y.message),y}function te(){if(et=new ab(P),et.init(),J=new XM(P,et),vt=new KS(P,et,e,J),b=new $M(P,et),vt.reversedDepthBuffer&&d)b.buffers.depth.setReversed(!0);z=P.createFramebuffer(),D=P.createFramebuffer(),C=P.createFramebuffer(),_=new ub(P),I=new PM,V=new ZM(P,et,b,I,vt,J,_),ne=new ob(M),ae=new dv(P),le=new YS(P,ae),ue=new cb(P,ae,_,le),Y=new db(P,ue,ae,le,_),je=new hb(P,vt,V),oe=new jS(I),j=new IM(M,ne,et,vt,le,oe),ge=new KM(M,I),we=new NM,he=new kM(et),Le=new qS(M,ne,b,Y,f,a),Ie=new WM(M,Y,vt),_e=new jM(P,_,vt,b),N=new JS(P,et,_),ce=new lb(P,et,_),_.programs=j.programs,M.capabilities=vt,M.extensions=et,M.properties=I,M.renderLists=we,M.shadowMap=Ie,M.state=b,M.info=_}if(g!==En)x=new pb(g,t.width,t.height,o,i,r);let fe=new jg(M,P);this.xr=fe,this.getContext=function(){return P},this.getContextAttributes=function(){return P.getContextAttributes()},this.forceContextLoss=function(){let y=et.get("WEBGL_lose_context");if(y)y.loseContext()},this.forceContextRestore=function(){let y=et.get("WEBGL_lose_context");if(y)y.restoreContext()},this.getPixelRatio=function(){return re},this.setPixelRatio=function(y){if(y===void 0)return;re=y,this.setSize(ke,q,!1)},this.getSize=function(y){return y.set(ke,q)},this.setSize=function(y,L,W=!0){if(fe.isPresenting){Te("WebGLRenderer: Can't change size while VR device is presenting.");return}if(ke=y,q=L,t.width=Math.floor(y*re),t.height=Math.floor(L*re),W===!0)t.style.width=y+"px",t.style.height=L+"px";if(x!==null)x.setSize(t.width,t.height);this.setViewport(0,0,y,L)},this.getDrawingBufferSize=function(y){return y.set(ke*re,q*re).floor()},this.setDrawingBufferSize=function(y,L,W){ke=y,q=L,re=W,t.width=Math.floor(y*W),t.height=Math.floor(L*W),this.setViewport(0,0,y,L)},this.setEffects=function(y){if(g===En){Ne("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(y){for(let L=0;L<y.length;L++)if(y[L].isOutputPass===!0){Te("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}x.setEffects(y||[])},this.getCurrentViewport=function(y){return y.copy(Q)},this.getViewport=function(y){return y.copy(De)},this.setViewport=function(y,L,W,k){if(y.isVector4)De.set(y.x,y.y,y.z,y.w);else De.set(y,L,W,k);b.viewport(Q.copy(De).multiplyScalar(re).round())},this.getScissor=function(y){return y.copy(Ce)},this.setScissor=function(y,L,W,k){if(y.isVector4)Ce.set(y.x,y.y,y.z,y.w);else Ce.set(y,L,W,k);b.scissor(ee.copy(Ce).multiplyScalar(re).round())},this.getScissorTest=function(){return Ct},this.setScissorTest=function(y){b.setScissorTest(Ct=y)},this.setOpaqueSort=function(y){se=y},this.setTransparentSort=function(y){Pe=y},this.getClearColor=function(y){return y.copy(Le.getClearColor())},this.setClearColor=function(){Le.setClearColor(...arguments)},this.getClearAlpha=function(){return Le.getClearAlpha()},this.setClearAlpha=function(){Le.setClearAlpha(...arguments)},this.clear=function(y=!0,L=!0,W=!0){let k=0;if(y){let B=!1;if(G!==null){let me=G.texture.format;B=S.has(me)}if(B){let me=G.texture.type,ye=p.has(me),pe=Le.getClearColor(),Se=Le.getClearAlpha(),{r:Me,g:Be,b:$e}=pe;if(ye)m[0]=Me,m[1]=Be,m[2]=$e,m[3]=Se,P.clearBufferuiv(P.COLOR,0,m);else T[0]=Me,T[1]=Be,T[2]=$e,T[3]=Se,P.clearBufferiv(P.COLOR,0,T)}else k|=P.COLOR_BUFFER_BIT}if(L)k|=P.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0);if(W)k|=P.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295);if(k!==0)P.clear(k)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(y){y.setRenderer(this),O=y},this.dispose=function(){t.removeEventListener("webglcontextlost",ze,!1),t.removeEventListener("webglcontextrestored",ht,!1),t.removeEventListener("webglcontextcreationerror",tt,!1),Le.dispose(),we.dispose(),he.dispose(),I.dispose(),ne.dispose(),Y.dispose(),le.dispose(),_e.dispose(),j.dispose(),fe.dispose(),fe.removeEventListener("sessionstart",Tu),fe.removeEventListener("sessionend",Eu),Di.stop()};function ze(y){y.preventDefault(),vs("WebGLRenderer: Context Lost."),H=!0}function ht(){vs("WebGLRenderer: Context Restored."),H=!1;let y=_.autoReset,L=Ie.enabled,W=Ie.autoUpdate,k=Ie.needsUpdate,B=Ie.type;te(),_.autoReset=y,Ie.enabled=L,Ie.autoUpdate=W,Ie.needsUpdate=k,Ie.type=B}function tt(y){Ne("WebGLRenderer: A WebGL context could not be created. Reason: ",y.statusMessage)}function Cn(y){let L=y.target;L.removeEventListener("dispose",Cn),Zn(L)}function Zn(y){N_(y),I.remove(y)}function N_(y){let L=I.get(y).programs;if(L!==void 0){if(L.forEach(function(W){j.releaseProgram(W)}),y.isShaderMaterial)j.releaseShaderCache(y)}}this.renderBufferDirect=function(y,L,W,k,B,me){if(L===null)L=Yt;let ye=B.isMesh&&B.matrixWorld.determinantAffine()<0,pe=O_(y,L,W,k,B);b.setMaterial(k,ye);let Se=W.index,Me=1;if(k.wireframe===!0){if(Se=ue.getWireframeAttribute(W),Se===void 0)return;Me=2}let Be=W.drawRange,$e=W.attributes.position,be=Be.start*Me,nt=(Be.start+Be.count)*Me;if(me!==null)be=Math.max(be,me.start*Me),nt=Math.min(nt,(me.start+me.count)*Me);if(Se!==null)be=Math.max(be,0),nt=Math.min(nt,Se.count);else if($e!==void 0&&$e!==null)be=Math.max(be,0),nt=Math.min(nt,$e.count);let At=nt-be;if(At<0||At===1/0)return;le.setup(B,k,pe,W,Se);let pt,ct=N;if(Se!==null)pt=ae.get(Se),ct=ce,ct.setIndex(pt);if(B.isMesh)if(k.wireframe===!0)b.setLineWidth(k.wireframeLinewidth*Pt()),ct.setMode(P.LINES);else ct.setMode(P.TRIANGLES);else if(B.isLine){let Ht=k.linewidth;if(Ht===void 0)Ht=1;if(b.setLineWidth(Ht*Pt()),B.isLineSegments)ct.setMode(P.LINES);else if(B.isLineLoop)ct.setMode(P.LINE_LOOP);else ct.setMode(P.LINE_STRIP)}else if(B.isPoints)ct.setMode(P.POINTS);else if(B.isSprite)ct.setMode(P.TRIANGLES);if(B.isBatchedMesh)if(!et.get("WEBGL_multi_draw")){let{_multiDrawStarts:Ht,_multiDrawCounts:xe,_multiDrawCount:Zt}=B,Ke=Se?ae.get(Se).bytesPerElement:1,dn=I.get(k).currentProgram.getUniforms();for(let In=0;In<Zt;In++)dn.setValue(P,"_gl_DrawID",In),ct.render(Ht[In]/Ke,xe[In])}else ct.renderMultiDraw(B._multiDrawStarts,B._multiDrawCounts,B._multiDrawCount);else if(B.isInstancedMesh)ct.renderInstances(be,At,B.count);else if(W.isInstancedBufferGeometry){let Ht=W._maxInstanceCount!==void 0?W._maxInstanceCount:1/0,xe=Math.min(W.instanceCount,Ht);ct.renderInstances(be,At,xe)}else ct.render(be,At)};function wu(y,L,W,k){if(O!==null&&y.isNodeMaterial)O.setObject(k,y);if(Ye===!0)oe.setState(y,W,!1);if(y.transparent===!0&&y.side===mn&&y.forceSinglePass===!1)y.side=jt,y.needsUpdate=!0,Xs(y,L,k),y.side=Mi,y.needsUpdate=!0,Xs(y,L,k),y.side=mn;else Xs(y,L,k)}this.compile=function(y,L,W=null){if(W===null)W=y;if(O!==null)O.renderStart(y,L,W);if(w=he.get(W),w.init(L),R.push(w),W.traverseVisible(function(B){if(B.isLight&&B.layers.test(L.layers)){if(w.pushLight(B),B.castShadow)w.pushShadow(B)}}),y!==W)y.traverseVisible(function(B){if(B.isLight&&B.layers.test(L.layers)){if(w.pushLight(B),B.castShadow)w.pushShadow(B)}});if(w.setupLights(),O!==null)O.updateLights(w.state.lightsArray);if(it=this.localClippingEnabled,Ye=oe.init(this.clippingPlanes,it),Ye===!0)oe.setGlobalState(this.clippingPlanes,L);if(O!==null)Ie.render(w.state.shadowsArray,W,L);let k=new Set;if(y.traverse(function(B){if(!(B.isMesh||B.isPoints||B.isLine||B.isSprite))return;let me=B.material;if(me)if(Array.isArray(me))for(let ye=0;ye<me.length;ye++){let pe=me[ye];wu(pe,W,L,B),k.add(pe)}else wu(me,W,L,B),k.add(me)}),w=R.pop(),O!==null)O.renderEnd();return k},this.compileAsync=function(y,L,W=null){let k=this.compile(y,L,W);return new Promise((B)=>{function me(){if(k.forEach(function(ye){let Se=I.get(ye).currentProgram;if(Se===void 0||Se.isReady())k.delete(ye)}),k.size===0){B(y);return}setTimeout(me,10)}if(et.get("KHR_parallel_shader_compile")!==null)me();else setTimeout(me,10)})};let Ra=null;function D_(y){if(Ra)Ra(y)}function Tu(){Di.stop()}function Eu(){Di.start()}let Di=new Bg;if(Di.setAnimationLoop(D_),typeof self<"u")Di.setContext(self);this.setAnimationLoop=function(y){Ra=y,fe.setAnimationLoop(y),y===null?Di.stop():Di.start()},fe.addEventListener("sessionstart",Tu),fe.addEventListener("sessionend",Eu),this.render=function(y,L){if(L!==void 0&&L.isCamera!==!0){Ne("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(H===!0)return;if(O!==null)O.renderStart(y,L);let W=fe.enabled===!0&&fe.isPresenting===!0,k=x!==null&&(G===null||W)&&x.begin(M,G);if(y.matrixWorldAutoUpdate===!0)y.updateMatrixWorld();if(L.parent===null&&L.matrixWorldAutoUpdate===!0)L.updateMatrixWorld();if(fe.enabled===!0&&fe.isPresenting===!0&&(x===null||x.isCompositing()===!1)){if(fe.cameraAutoUpdate===!0)fe.updateCamera(L);L=fe.getCamera()}if(y.isScene===!0)y.onBeforeRender(M,y,L,G);if(w=he.get(y,R.length),w.init(L),w.state.textureUnits=V.getTextureUnits(),R.push(w),Je.multiplyMatrices(L.projectionMatrix,L.matrixWorldInverse),Xe.setFromProjectionMatrix(Je,Dl,L.reversedDepth),it=this.localClippingEnabled,Ye=oe.init(this.clippingPlanes,it),v=we.get(y,E.length),v.init(),E.push(v),fe.enabled===!0&&fe.isPresenting===!0){let ye=M.xr.getDepthSensingMesh();if(ye!==null)Ca(ye,L,-1/0,M.sortObjects)}if(Ca(y,L,0,M.sortObjects),v.finish(),O!==null)O.updateLights(w.state.lightsArray);if(M.sortObjects===!0)v.sort(se,Pe);if(It=fe.enabled===!1||fe.isPresenting===!1||fe.hasDepthSensing()===!1,It)Le.addToRenderList(v,y);if(this.info.render.frame++,this.info.autoReset===!0)this.info.reset();if(Ye===!0)oe.beginShadows();let B=w.state.shadowsArray;if(Ie.render(B,y,L),Ye===!0)oe.endShadows();if((k&&x.hasRenderPass())===!1){let ye=v.opaque,pe=v.transmissive;if(w.setupLights(),L.isArrayCamera){let Se=L.cameras;if(pe.length>0)for(let Me=0,Be=Se.length;Me<Be;Me++){let $e=Se[Me];Ru(ye,pe,y,$e)}if(It)Le.render(y);for(let Me=0,Be=Se.length;Me<Be;Me++){let $e=Se[Me];Au(v,y,$e,$e.viewport)}}else{if(pe.length>0)Ru(ye,pe,y,L);if(It)Le.render(y);Au(v,y,L)}}if(G!==null&&Z===0)V.updateMultisampleRenderTarget(G),V.updateRenderTargetMipmap(G);if(k)x.end(M);if(y.isScene===!0)y.onAfterRender(M,y,L);if(le.resetDefaultState(),ie=-1,X=null,R.pop(),R.length>0){if(w=R[R.length-1],V.setTextureUnits(w.state.textureUnits),Ye===!0)oe.setGlobalState(M.clippingPlanes,w.state.camera)}else w=null;if(E.pop(),E.length>0)v=E[E.length-1];else v=null;if(O!==null)O.renderEnd()};function Ca(y,L,W,k){if(y.visible===!1)return;if(y.layers.test(L.layers)){if(y.isGroup)W=y.renderOrder;else if(y.isLOD){if(y.autoUpdate===!0)y.update(L)}else if(y.isLightProbeGrid)w.pushLightProbeGrid(y);else if(y.isLight){if(w.pushLight(y),y.castShadow)w.pushShadow(y)}else if(y.isSprite){if(!y.frustumCulled||y.intersectsFrustum(Xe)){if(k)ft.setFromMatrixPosition(y.matrixWorld).applyMatrix4(Je);let ye=Y.update(y),pe=y.material;if(pe.visible)v.push(y,ye,pe,W,ft.z,null,L)}}else if(y.isMesh||y.isLine||y.isPoints){if(!y.frustumCulled||y.intersectsFrustum(Xe)){let ye=Y.update(y),pe=y.material;if(k){if(y.boundingSphere!==void 0){if(y.boundingSphere===null)y.computeBoundingSphere();ft.copy(y.boundingSphere.center)}else{if(ye.boundingSphere===null)ye.computeBoundingSphere();ft.copy(ye.boundingSphere.center)}ft.applyMatrix4(y.matrixWorld).applyMatrix4(Je)}if(Array.isArray(pe)){let Se=ye.groups;for(let Me=0,Be=Se.length;Me<Be;Me++){let $e=Se[Me],be=pe[$e.materialIndex];if(be&&be.visible)v.push(y,ye,be,W,ft.z,$e,L)}}else if(pe.visible)v.push(y,ye,pe,W,ft.z,null,L)}}}let me=y.children;for(let ye=0,pe=me.length;ye<pe;ye++)Ca(me[ye],L,W,k)}function Au(y,L,W,k){let{opaque:B,transmissive:me,transparent:ye}=y;if(w.setupLightsView(W),Ye===!0)oe.setGlobalState(M.clippingPlanes,W);if(k)b.viewport(Q.copy(k));if(B.length>0)Zs(B,L,W);if(me.length>0)Zs(me,L,W);if(ye.length>0)Zs(ye,L,W);b.buffers.depth.setTest(!0),b.buffers.depth.setMask(!0),b.buffers.color.setMask(!0),b.setPolygonOffset(!1)}function Ru(y,L,W,k){if((W.isScene===!0?W.overrideMaterial:null)!==null)return;if(w.state.transmissionRenderTarget[k.id]===void 0){let be=et.has("EXT_color_buffer_half_float")||et.has("EXT_color_buffer_float");w.state.transmissionRenderTarget[k.id]=new an(1,1,{generateMipmaps:!0,type:be?Fn:En,minFilter:On,samples:Math.max(4,vt.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:He.workingColorSpace})}let me=w.state.transmissionRenderTarget[k.id],ye=k.viewport||Q;me.setSize(ye.z*M.transmissionResolutionScale,ye.w*M.transmissionResolutionScale);let pe=M.getRenderTarget(),Se=M.getActiveCubeFace(),Me=M.getActiveMipmapLevel();if(M.setRenderTarget(me),M.getClearColor(Ee),qe=M.getClearAlpha(),qe<1)M.setClearColor(16777215,0.5);if(M.clear(),It)Le.render(W);let Be=M.toneMapping;M.toneMapping=wn;let $e=k.viewport;if(k.viewport!==void 0)k.viewport=void 0;if(w.setupLightsView(k),Ye===!0)oe.setGlobalState(M.clippingPlanes,k);if(Zs(y,W,k),V.updateMultisampleRenderTarget(me),V.updateRenderTargetMipmap(me),et.has("WEBGL_multisampled_render_to_texture")===!1){let be=!1;for(let nt=0,At=L.length;nt<At;nt++){let pt=L[nt],{object:ct,geometry:Ht,material:xe,group:Zt}=pt;if(xe.side===mn&&ct.layers.test(k.layers)){let Ke=xe.side;xe.side=jt,xe.needsUpdate=!0,Cu(ct,W,k,Ht,xe,Zt),xe.side=Ke,xe.needsUpdate=!0,be=!0}}if(be===!0)V.updateMultisampleRenderTarget(me),V.updateRenderTargetMipmap(me)}if(M.setRenderTarget(pe,Se,Me),M.setClearColor(Ee,qe),$e!==void 0)k.viewport=$e;M.toneMapping=Be}function Zs(y,L,W){let k=L.isScene===!0?L.overrideMaterial:null;for(let B=0,me=y.length;B<me;B++){let ye=y[B],{object:pe,geometry:Se,group:Me}=ye,Be=ye.material;if(Be.allowOverride===!0&&k!==null)Be=k;if(pe.layers.test(W.layers))Cu(pe,L,W,Se,Be,Me)}}function Cu(y,L,W,k,B,me){if(O!==null&&B.isNodeMaterial)O.setObject(y,B);if(y.onBeforeRender(M,L,W,k,B,me),y.modelViewMatrix.multiplyMatrices(W.matrixWorldInverse,y.matrixWorld),y.normalMatrix.getNormalMatrix(y.modelViewMatrix),B.onBeforeRender(M,L,W,k,y,me),B.transparent===!0&&B.side===mn&&B.forceSinglePass===!1)B.side=jt,B.needsUpdate=!0,M.renderBufferDirect(W,L,k,B,y,me),B.side=Mi,B.needsUpdate=!0,M.renderBufferDirect(W,L,k,B,y,me),B.side=mn;else M.renderBufferDirect(W,L,k,B,y,me);y.onAfterRender(M,L,W,k,B,me)}function Xs(y,L,W){if(L.isScene!==!0)L=Yt;let k=I.get(y),B=w.state.lights,me=w.state.shadowsArray,ye=B.state.version,pe=j.getParameters(y,B.state,me,L,W,w.state.lightProbeGridArray),Se=j.getProgramCacheKey(pe),Me=k.programs;k.environment=y.isMeshStandardMaterial||y.isMeshLambertMaterial||y.isMeshPhongMaterial?L.environment:null,k.fog=L.fog;let Be=y.isMeshStandardMaterial||y.isMeshLambertMaterial&&!y.envMap||y.isMeshPhongMaterial&&!y.envMap;if(k.envMap=ne.get(y.envMap||k.environment,Be),k.envMapRotation=k.environment!==null&&y.envMap===null?L.environmentRotation:y.envMapRotation,Me===void 0)y.addEventListener("dispose",Cn),Me=new Map,k.programs=Me;let $e=Me.get(Se);if($e!==void 0){if(k.currentProgram===$e&&k.lightsStateVersion===ye)return Pu(y,pe),$e}else{if(pe.uniforms=j.getUniforms(y),O!==null&&y.isNodeMaterial)O.build(y,W,pe);y.onBeforeCompile(pe,M),$e=j.acquireProgram(pe,Se),Me.set(Se,$e),k.uniforms=pe.uniforms}let be=k.uniforms;if(!y.isShaderMaterial&&!y.isRawShaderMaterial||y.clipping===!0)be.clippingPlanes=oe.uniform;if(Pu(y,pe),k.needsLights=z_(y),k.lightsStateVersion=ye,k.needsLights)be.ambientLightColor.value=B.state.ambient,be.lightProbe.value=B.state.probe,be.sunLights.value=B.state.sun,be.sunLightShadows.value=B.state.sunShadow,be.directionalLights.value=B.state.directional,be.directionalLightShadows.value=B.state.directionalShadow,be.spotLights.value=B.state.spot,be.spotLightShadows.value=B.state.spotShadow,be.rectAreaLights.value=B.state.rectArea,be.ltc_1.value=B.state.rectAreaLTC1,be.ltc_2.value=B.state.rectAreaLTC2,be.pointLights.value=B.state.point,be.pointLightShadows.value=B.state.pointShadow,be.hemisphereLights.value=B.state.hemi,be.sunShadowMatrix.value=B.state.sunShadowMatrix,be.sunShadowCascade.value=B.state.sunShadowCascade,be.directionalShadowMatrix.value=B.state.directionalShadowMatrix,be.spotLightMatrix.value=B.state.spotLightMatrix,be.spotLightMap.value=B.state.spotLightMap,be.pointShadowMatrix.value=B.state.pointShadowMatrix;return k.lightProbeGrid=w.state.lightProbeGridArray.length>0,k.currentProgram=$e,k.uniformsList=null,$e}function Iu(y){if(y.uniformsList===null){let L=y.currentProgram.getUniforms();y.uniformsList=Ws.seqWithValue(L.seq,y.uniforms)}return y.uniformsList}function Pu(y,L){let W=I.get(y);W.outputColorSpace=L.outputColorSpace,W.batching=L.batching,W.batchingColor=L.batchingColor,W.instancing=L.instancing,W.instancingColor=L.instancingColor,W.instancingMorph=L.instancingMorph,W.skinning=L.skinning,W.morphTargets=L.morphTargets,W.morphNormals=L.morphNormals,W.morphColors=L.morphColors,W.morphTargetsCount=L.morphTargetsCount,W.numClippingPlanes=L.numClippingPlanes,W.numIntersection=L.numClipIntersection,W.vertexAlphas=L.vertexAlphas,W.vertexTangents=L.vertexTangents,W.toneMapping=L.toneMapping}function U_(y,L){if(y.length===0)return null;if(y.length===1)return y[0].texture!==null?y[0]:null;A.setFromMatrixPosition(L.matrixWorld);for(let W=0,k=y.length;W<k;W++){let B=y[W];if(B.texture!==null&&B.boundingBox.containsPoint(A))return B}return null}function O_(y,L,W,k,B){if(L.isScene!==!0)L=Yt;V.resetTextureUnits();let me=L.fog,ye=k.isMeshStandardMaterial||k.isMeshLambertMaterial||k.isMeshPhongMaterial?L.environment:null,pe=G===null?M.outputColorSpace:G.isXRRenderTarget===!0?G.texture.colorSpace:He.workingColorSpace,Se=k.isMeshStandardMaterial||k.isMeshLambertMaterial&&!k.envMap||k.isMeshPhongMaterial&&!k.envMap,Me=ne.get(k.envMap||ye,Se),Be=k.vertexColors===!0&&!!W.attributes.color&&W.attributes.color.itemSize===4,$e=!!W.attributes.tangent&&(!!k.normalMap||k.anisotropy>0),be=!!W.morphAttributes.position,nt=!!W.morphAttributes.normal,At=!!W.morphAttributes.color,pt=wn;if(k.toneMapped){if(G===null||G.isXRRenderTarget===!0)pt=M.toneMapping}let ct=W.morphAttributes.position||W.morphAttributes.normal||W.morphAttributes.color,Ht=ct!==void 0?ct.length:0,xe=I.get(k),Zt=w.state.lights;if(Ye===!0){if(it===!0||y!==X){let dt=y===X&&k.id===ie;oe.setState(k,y,dt)}}let Ke=!1;if(k.version===xe.__version){if(xe.needsLights&&xe.lightsStateVersion!==Zt.state.version)Ke=!0;else if(xe.outputColorSpace!==pe)Ke=!0;else if(B.isBatchedMesh&&xe.batching===!1)Ke=!0;else if(!B.isBatchedMesh&&xe.batching===!0)Ke=!0;else if(B.isBatchedMesh&&xe.batchingColor===!0&&B._colorsTexture===null)Ke=!0;else if(B.isBatchedMesh&&xe.batchingColor===!1&&B._colorsTexture!==null)Ke=!0;else if(B.isInstancedMesh&&xe.instancing===!1)Ke=!0;else if(!B.isInstancedMesh&&xe.instancing===!0)Ke=!0;else if(B.isSkinnedMesh&&xe.skinning===!1)Ke=!0;else if(!B.isSkinnedMesh&&xe.skinning===!0)Ke=!0;else if(B.isInstancedMesh&&xe.instancingColor===!0&&B.instanceColor===null)Ke=!0;else if(B.isInstancedMesh&&xe.instancingColor===!1&&B.instanceColor!==null)Ke=!0;else if(B.isInstancedMesh&&xe.instancingMorph===!0&&B.morphTexture===null)Ke=!0;else if(B.isInstancedMesh&&xe.instancingMorph===!1&&B.morphTexture!==null)Ke=!0;else if(xe.envMap!==Me)Ke=!0;else if(k.fog===!0&&xe.fog!==me)Ke=!0;else if(xe.numClippingPlanes!==void 0&&(xe.numClippingPlanes!==oe.numPlanes||xe.numIntersection!==oe.numIntersection))Ke=!0;else if(xe.vertexAlphas!==Be)Ke=!0;else if(xe.vertexTangents!==$e)Ke=!0;else if(xe.morphTargets!==be)Ke=!0;else if(xe.morphNormals!==nt)Ke=!0;else if(xe.morphColors!==At)Ke=!0;else if(xe.toneMapping!==pt)Ke=!0;else if(xe.morphTargetsCount!==Ht)Ke=!0;else if(!!xe.lightProbeGrid!==w.state.lightProbeGridArray.length>0)Ke=!0}else Ke=!0,xe.__version=k.version;let dn=xe.currentProgram;if(Ke===!0){if(dn=Xs(k,L,B),O&&k.isNodeMaterial)O.onUpdateProgram(k,dn,xe)}let In=!1,ci=!1,or=!1,at=dn.getUniforms(),wt=xe.uniforms;if(b.useProgram(dn.program))In=!0,ci=!0,or=!0;if(k.id!==ie)ie=k.id,ci=!0;if(xe.needsLights){let dt=U_(w.state.lightProbeGridArray,B);if(xe.lightProbeGrid!==dt)xe.lightProbeGrid=dt,ci=!0}if(In||X!==y){if(b.buffers.depth.getReversed()&&y.reversedDepth!==!0)y._reversedDepth=!0,y.updateProjectionMatrix();at.setValue(P,"projectionMatrix",y.projectionMatrix),at.setValue(P,"viewMatrix",y.matrixWorldInverse);let ui=at.map.cameraPosition;if(ui!==void 0)ui.setValue(P,kt.setFromMatrixPosition(y.matrixWorld));if(vt.logarithmicDepthBuffer)at.setValue(P,"logDepthBufFC",2/(Math.log(y.far+1)/Math.LN2));if(k.isMeshPhongMaterial||k.isMeshToonMaterial||k.isMeshLambertMaterial||k.isMeshBasicMaterial||k.isMeshStandardMaterial||k.isShaderMaterial)at.setValue(P,"isOrthographic",y.isOrthographicCamera===!0);if(X!==y)X=y,ci=!0,or=!0}if(xe.needsLights){if(Zt.state.sunShadowMap.length>0)at.setValue(P,"sunShadowMap",Zt.state.sunShadowMap,V);if(Zt.state.directionalShadowMap.length>0)at.setValue(P,"directionalShadowMap",Zt.state.directionalShadowMap,V);if(Zt.state.spotShadowMap.length>0)at.setValue(P,"spotShadowMap",Zt.state.spotShadowMap,V);if(Zt.state.pointShadowMap.length>0)at.setValue(P,"pointShadowMap",Zt.state.pointShadowMap,V)}if(B.isSkinnedMesh){at.setOptional(P,B,"bindMatrix"),at.setOptional(P,B,"bindMatrixInverse");let dt=B.skeleton;if(dt){if(dt.boneTexture===null)dt.computeBoneTexture();at.setValue(P,"boneTexture",dt.boneTexture,V)}}if(B.isBatchedMesh){if(at.setOptional(P,B,"batchingTexture"),at.setValue(P,"batchingTexture",B._matricesTexture,V),at.setOptional(P,B,"batchingIdTexture"),at.setValue(P,"batchingIdTexture",B._indirectTexture,V),at.setOptional(P,B,"batchingColorTexture"),B._colorsTexture!==null)at.setValue(P,"batchingColorTexture",B._colorsTexture,V)}let li=W.morphAttributes;if(li.position!==void 0||li.normal!==void 0||li.color!==void 0)je.update(B,W,dn);if(ci||xe.receiveShadow!==B.receiveShadow)xe.receiveShadow=B.receiveShadow,at.setValue(P,"receiveShadow",B.receiveShadow);if((k.isMeshStandardMaterial||k.isMeshLambertMaterial||k.isMeshPhongMaterial)&&k.envMap===null&&L.environment!==null)wt.envMapIntensity.value=L.environmentIntensity;if(wt.dfgLUT!==void 0)wt.dfgLUT.value=ew();if(ci){if(at.setValue(P,"toneMappingExposure",M.toneMappingExposure),xe.needsLights)F_(wt,or);if(me&&k.fog===!0)ge.refreshFogUniforms(wt,me);if(ge.refreshMaterialUniforms(wt,k,re,q,w.state.transmissionRenderTarget[y.id]),xe.needsLights&&xe.lightProbeGrid){let dt=xe.lightProbeGrid;wt.probesSH.value=dt.texture,wt.probesMin.value.copy(dt.boundingBox.min),wt.probesMax.value.copy(dt.boundingBox.max),wt.probesResolution.value.copy(dt.resolution)}Ws.upload(P,Iu(xe),wt,V)}if(k.isShaderMaterial&&k.uniformsNeedUpdate===!0)Ws.upload(P,Iu(xe),wt,V),k.uniformsNeedUpdate=!1;if(k.isSpriteMaterial)at.setValue(P,"center",B.center);if(at.setValue(P,"modelViewMatrix",B.modelViewMatrix),at.setValue(P,"normalMatrix",B.normalMatrix),at.setValue(P,"modelMatrix",B.matrixWorld),k.uniformsGroups!==void 0){let dt=k.uniformsGroups;for(let ui=0,ar=dt.length;ui<ar;ui++){let Nu=dt[ui];_e.update(Nu,dn),_e.bind(Nu,dn)}}return dn}function F_(y,L){y.ambientLightColor.needsUpdate=L,y.lightProbe.needsUpdate=L,y.sunLights.needsUpdate=L,y.sunLightShadows.needsUpdate=L,y.directionalLights.needsUpdate=L,y.directionalLightShadows.needsUpdate=L,y.pointLights.needsUpdate=L,y.pointLightShadows.needsUpdate=L,y.spotLights.needsUpdate=L,y.spotLightShadows.needsUpdate=L,y.rectAreaLights.needsUpdate=L,y.hemisphereLights.needsUpdate=L}function z_(y){return y.isMeshLambertMaterial||y.isMeshToonMaterial||y.isMeshPhongMaterial||y.isMeshStandardMaterial||y.isShadowMaterial||y.isShaderMaterial&&y.lights===!0}this.getActiveCubeFace=function(){return F},this.getActiveMipmapLevel=function(){return Z},this.getRenderTarget=function(){return G},this.setRenderTargetTextures=function(y,L,W){let k=I.get(y);if(k.__autoAllocateDepthBuffer=y.resolveDepthBuffer===!1,k.__autoAllocateDepthBuffer===!1)k.__useRenderToTexture=!1;I.get(y.texture).__webglTexture=L,I.get(y.depthTexture).__webglTexture=k.__autoAllocateDepthBuffer?void 0:W,k.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(y,L){let W=I.get(y);W.__webglFramebuffer=L,W.__useDefaultFramebuffer=L===void 0},this.setRenderTarget=function(y,L=0,W=0){G=y,F=L,Z=W;let k=null,B=!1,me=!1;if(y){let pe=I.get(y);if(pe.__useDefaultFramebuffer!==void 0){b.bindFramebuffer(P.FRAMEBUFFER,pe.__webglFramebuffer),Q.copy(y.viewport),ee.copy(y.scissor),ve=y.scissorTest,b.viewport(Q),b.scissor(ee),b.setScissorTest(ve),ie=-1;return}else if(pe.__webglFramebuffer===void 0)V.setupRenderTarget(y);else if(pe.__hasExternalTextures)V.rebindTextures(y,I.get(y.texture).__webglTexture,I.get(y.depthTexture).__webglTexture);else if(y.depthBuffer){let Be=y.depthTexture;if(pe.__boundDepthTexture!==Be){if(Be!==null&&I.has(Be)&&(y.width!==Be.image.width||y.height!==Be.image.height))throw Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");V.setupDepthRenderbuffer(y)}}let Se=y.texture;if(Se.isData3DTexture||Se.isDataArrayTexture||Se.isCompressedArrayTexture)me=!0;let Me=I.get(y).__webglFramebuffer;if(y.isWebGLCubeRenderTarget){if(Array.isArray(Me[L]))k=Me[L][W];else k=Me[L];B=!0}else if(y.samples>0&&V.useMultisampledRTT(y)===!1)k=I.get(y).__webglMultisampledFramebuffer;else if(Array.isArray(Me))k=Me[W];else k=Me;Q.copy(y.viewport),ee.copy(y.scissor),ve=y.scissorTest}else Q.copy(De).multiplyScalar(re).floor(),ee.copy(Ce).multiplyScalar(re).floor(),ve=Ct;if(W!==0)k=z;if(b.bindFramebuffer(P.FRAMEBUFFER,k))b.drawBuffers(y,k);if(b.viewport(Q),b.scissor(ee),b.setScissorTest(ve),B){let pe=I.get(y.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_CUBE_MAP_POSITIVE_X+L,pe.__webglTexture,W)}else if(me){let pe=L;for(let Se=0;Se<y.textures.length;Se++){let Me=I.get(y.textures[Se]);P.framebufferTextureLayer(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0+Se,Me.__webglTexture,W,pe)}}else if(y!==null&&W!==0){let pe=I.get(y.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,pe.__webglTexture,W)}ie=-1};function Lu(y){let L=I.get(y);if(L.__readFormat!==y.format||L.__readType!==y.type)L.__readFormat=y.format,L.__readType=y.type,L.__formatReadable=vt.textureFormatReadable(y.format),L.__typeReadable=vt.textureTypeReadable(y.type);return L}if(this.readRenderTargetPixels=function(y,L,W,k,B,me,ye,pe=0){if(!(y&&y.isWebGLRenderTarget)){Ne("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Se=I.get(y).__webglFramebuffer;if(y.isWebGLCubeRenderTarget&&ye!==void 0)Se=Se[ye];if(Se){b.bindFramebuffer(P.FRAMEBUFFER,Se);try{let Me=y.textures[pe],{format:Be,type:$e}=Me;if(y.textures.length>1)P.readBuffer(P.COLOR_ATTACHMENT0+pe);let be=Lu(Me);if(be.__formatReadable===!1){Ne("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(be.__typeReadable===!1){Ne("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}if(L>=0&&L<=y.width-k&&(W>=0&&W<=y.height-B))P.readPixels(L,W,k,B,J.convert(Be),J.convert($e),me)}finally{let Me=G!==null?I.get(G).__webglFramebuffer:null;b.bindFramebuffer(P.FRAMEBUFFER,Me)}}},this.readRenderTargetPixelsAsync=async function(y,L,W,k,B,me,ye,pe=0){if(!(y&&y.isWebGLRenderTarget))throw Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Se=I.get(y).__webglFramebuffer;if(y.isWebGLCubeRenderTarget&&ye!==void 0)Se=Se[ye];if(Se)if(L>=0&&L<=y.width-k&&(W>=0&&W<=y.height-B)){b.bindFramebuffer(P.FRAMEBUFFER,Se);let Me=y.textures[pe],{format:Be,type:$e}=Me;if(y.textures.length>1)P.readBuffer(P.COLOR_ATTACHMENT0+pe);let be=Lu(Me);if(be.__formatReadable===!1)throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(be.__typeReadable===!1)throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let nt=P.createBuffer();P.bindBuffer(P.PIXEL_PACK_BUFFER,nt),P.bufferData(P.PIXEL_PACK_BUFFER,me.byteLength,P.STREAM_READ),P.readPixels(L,W,k,B,J.convert(Be),J.convert($e),0),P.bindBuffer(P.PIXEL_PACK_BUFFER,null);let At=G!==null?I.get(G).__webglFramebuffer:null;b.bindFramebuffer(P.FRAMEBUFFER,At);let pt=P.fenceSync(P.SYNC_GPU_COMMANDS_COMPLETE,0);return P.flush(),await ag(P,pt,4),P.bindBuffer(P.PIXEL_PACK_BUFFER,nt),P.getBufferSubData(P.PIXEL_PACK_BUFFER,0,me),P.bindBuffer(P.PIXEL_PACK_BUFFER,null),P.deleteBuffer(nt),P.deleteSync(pt),me}else throw Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(y,L=null,W=0){let k=Math.pow(2,-W),B=Math.floor(y.image.width*k),me=Math.floor(y.image.height*k),ye=L!==null?L.x:0,pe=L!==null?L.y:0;V.setTexture2D(y,0),P.copyTexSubImage2D(P.TEXTURE_2D,W,0,0,ye,pe,B,me),b.unbindTexture()},this.copyTextureToTexture=function(y,L,W=null,k=null,B=0,me=0){let ye,pe,Se,Me,Be,$e,be,nt,At,pt=y.isCompressedTexture?y.mipmaps[me]:y.image;if(W!==null)ye=W.max.x-W.min.x,pe=W.max.y-W.min.y,Se=W.isBox3?W.max.z-W.min.z:1,Me=W.min.x,Be=W.min.y,$e=W.isBox3?W.min.z:0;else{let wt=Math.pow(2,-B);if(ye=Math.floor(pt.width*wt),pe=Math.floor(pt.height*wt),y.isDataArrayTexture)Se=pt.depth;else if(y.isData3DTexture)Se=Math.floor(pt.depth*wt);else Se=1;Me=0,Be=0,$e=0}if(k!==null)be=k.x,nt=k.y,At=k.z;else be=0,nt=0,At=0;let ct=J.convert(L.format),Ht=J.convert(L.type),xe;if(L.isData3DTexture)V.setTexture3D(L,0),xe=P.TEXTURE_3D;else if(L.isDataArrayTexture||L.isCompressedArrayTexture)V.setTexture2DArray(L,0),xe=P.TEXTURE_2D_ARRAY;else V.setTexture2D(L,0),xe=P.TEXTURE_2D;b.activeTexture(P.TEXTURE0),b.pixelStorei(P.UNPACK_FLIP_Y_WEBGL,L.flipY),b.pixelStorei(P.UNPACK_PREMULTIPLY_ALPHA_WEBGL,L.premultiplyAlpha),b.pixelStorei(P.UNPACK_ALIGNMENT,L.unpackAlignment);let Zt=b.getParameter(P.UNPACK_ROW_LENGTH),Ke=b.getParameter(P.UNPACK_IMAGE_HEIGHT),dn=b.getParameter(P.UNPACK_SKIP_PIXELS),In=b.getParameter(P.UNPACK_SKIP_ROWS),ci=b.getParameter(P.UNPACK_SKIP_IMAGES);b.pixelStorei(P.UNPACK_ROW_LENGTH,pt.width),b.pixelStorei(P.UNPACK_IMAGE_HEIGHT,pt.height),b.pixelStorei(P.UNPACK_SKIP_PIXELS,Me),b.pixelStorei(P.UNPACK_SKIP_ROWS,Be),b.pixelStorei(P.UNPACK_SKIP_IMAGES,$e);let or=y.isDataArrayTexture||y.isData3DTexture,at=L.isDataArrayTexture||L.isData3DTexture;if(y.isDepthTexture){let wt=I.get(y),li=I.get(L),dt=I.get(wt.__renderTarget),ui=I.get(li.__renderTarget);b.bindFramebuffer(P.READ_FRAMEBUFFER,dt.__webglFramebuffer),b.bindFramebuffer(P.DRAW_FRAMEBUFFER,ui.__webglFramebuffer);for(let ar=0;ar<Se;ar++){if(or)P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,I.get(y).__webglTexture,B,$e+ar),P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,I.get(L).__webglTexture,me,At+ar);P.blitFramebuffer(Me,Be,ye,pe,be,nt,ye,pe,P.DEPTH_BUFFER_BIT,P.NEAREST)}b.bindFramebuffer(P.READ_FRAMEBUFFER,null),b.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else if(B!==0||y.isRenderTargetTexture||I.has(y)){let wt=I.get(y),li=I.get(L);b.bindFramebuffer(P.READ_FRAMEBUFFER,D),b.bindFramebuffer(P.DRAW_FRAMEBUFFER,C);for(let dt=0;dt<Se;dt++){if(or)P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,wt.__webglTexture,B,$e+dt);else P.framebufferTexture2D(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,wt.__webglTexture,B);if(at)P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,li.__webglTexture,me,At+dt);else P.framebufferTexture2D(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,li.__webglTexture,me);if(B!==0)P.blitFramebuffer(Me,Be,ye,pe,be,nt,ye,pe,P.COLOR_BUFFER_BIT,P.NEAREST);else if(at)P.copyTexSubImage3D(xe,me,be,nt,At+dt,Me,Be,ye,pe);else P.copyTexSubImage2D(xe,me,be,nt,Me,Be,ye,pe)}b.bindFramebuffer(P.READ_FRAMEBUFFER,null),b.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else if(at)if(y.isDataTexture||y.isData3DTexture)P.texSubImage3D(xe,me,be,nt,At,ye,pe,Se,ct,Ht,pt.data);else if(L.isCompressedArrayTexture)P.compressedTexSubImage3D(xe,me,be,nt,At,ye,pe,Se,ct,pt.data);else P.texSubImage3D(xe,me,be,nt,At,ye,pe,Se,ct,Ht,pt);else if(y.isDataTexture)P.texSubImage2D(P.TEXTURE_2D,me,be,nt,ye,pe,ct,Ht,pt.data);else if(y.isCompressedTexture)P.compressedTexSubImage2D(P.TEXTURE_2D,me,be,nt,pt.width,pt.height,ct,pt.data);else P.texSubImage2D(P.TEXTURE_2D,me,be,nt,ye,pe,ct,Ht,pt);if(b.pixelStorei(P.UNPACK_ROW_LENGTH,Zt),b.pixelStorei(P.UNPACK_IMAGE_HEIGHT,Ke),b.pixelStorei(P.UNPACK_SKIP_PIXELS,dn),b.pixelStorei(P.UNPACK_SKIP_ROWS,In),b.pixelStorei(P.UNPACK_SKIP_IMAGES,ci),me===0&&L.generateMipmaps)P.generateMipmap(xe);b.unbindTexture()},this.initRenderTarget=function(y){if(I.get(y).__webglFramebuffer===void 0)V.setupRenderTarget(y)},this.initTexture=function(y){if(y.isCubeTexture)V.setTextureCube(y,0);else if(y.isData3DTexture)V.setTexture3D(y,0);else if(y.isDataArrayTexture||y.isCompressedArrayTexture)V.setTexture2DArray(y,0);else V.setTexture2D(y,0);b.unbindTexture()},this.resetState=function(){F=0,Z=0,G=null,b.reset(),le.reset()},typeof __THREE_DEVTOOLS__<"u")__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Dl}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=He._getDrawingBufferColorSpace(e),t.unpackColorSpace=He._getUnpackColorSpace()}}function pu(e,t){if(t===Cl)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),e;if(t===Br||t===ws){let n=e.getIndex();if(n===null){let s=[],o=e.getAttribute("position");if(o!==void 0){for(let a=0;a<o.count;a++)s.push(a);e.setIndex(s),n=e.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),e}let i=n.count-2,r=[];if(t===Br)for(let s=1;s<=i;s++)r.push(n.getX(0)),r.push(n.getX(s)),r.push(n.getX(s+1));else for(let s=0;s<i;s++)if(s%2===0)r.push(n.getX(s)),r.push(n.getX(s+1)),r.push(n.getX(s+2));else r.push(n.getX(s+2)),r.push(n.getX(s+1)),r.push(n.getX(s));if(r.length/3!==i)console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");return e.setIndex(r),e.clearGroups(),e}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",t),e}function e_(e){let t=new Map,n=new Map,i=e.clone();return t_(e,i,function(r,s){t.set(s,r),n.set(r,s)}),i.traverse(function(r){if(!r.isSkinnedMesh)return;let s=r,o=t.get(r),a=o.skeleton.bones;s.skeleton=o.skeleton.clone(),s.bindMatrix.copy(o.bindMatrix),s.skeleton.bones=a.map(function(c){return n.get(c)}),s.bind(s.skeleton,s.bindMatrix)}),i}function t_(e,t,n){n(e,t);for(let i=0;i<e.children.length;i++)t_(e.children[i],t.children[i],n)}class Su extends ai{constructor(e){super(e);this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new l_(t)}),this.register(function(t){return new u_(t)}),this.register(function(t){return new v_(t)}),this.register(function(t){return new y_(t)}),this.register(function(t){return new S_(t)}),this.register(function(t){return new d_(t)}),this.register(function(t){return new f_(t)}),this.register(function(t){return new p_(t)}),this.register(function(t){return new m_(t)}),this.register(function(t){return new c_(t)}),this.register(function(t){return new g_(t)}),this.register(function(t){return new h_(t)}),this.register(function(t){return new x_(t)}),this.register(function(t){return new __(t)}),this.register(function(t){return new o_(t)}),this.register(function(t){return new xu(t,We.EXT_MESHOPT_COMPRESSION)}),this.register(function(t){return new xu(t,We.KHR_MESHOPT_COMPRESSION)}),this.register(function(t){return new b_(t)})}load(e,t,n,i){let r=this,s;if(this.resourcePath!=="")s=this.resourcePath;else if(this.path!==""){let c=Li.extractUrlBase(e);s=Li.resolveURL(c,this.path)}else s=Li.extractUrlBase(e);this.manager.itemStart(e);let o=function(c){if(i)i(c);else console.error(c);r.manager.itemError(e),r.manager.itemEnd(e)},a=new ks(this.manager);a.setPath(this.path),a.setResponseType("arraybuffer"),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(e,function(c){try{r.parse(c,s,function(l){t(l),r.manager.itemEnd(e)},o)}catch(l){o(l)}},n,o)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){if(this.pluginCallbacks.indexOf(e)===-1)this.pluginCallbacks.push(e);return this}unregister(e){if(this.pluginCallbacks.indexOf(e)!==-1)this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1);return this}parse(e,t,n,i){let r,s={},o={},a=new TextDecoder;if(typeof e==="string")r=JSON.parse(e);else if(e instanceof ArrayBuffer)if(a.decode(new Uint8Array(e,0,4))===M_){try{s[We.KHR_BINARY_GLTF]=new w_(e)}catch(u){if(i)i(u);return}r=JSON.parse(s[We.KHR_BINARY_GLTF].content)}else r=JSON.parse(a.decode(e));else r=e;if(r.asset===void 0||r.asset.version[0]<2){if(i)i(Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}let c=new C_(r,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let l=0;l<this.pluginCallbacks.length;l++){let u=this.pluginCallbacks[l](c);if(!u.name)console.error("THREE.GLTFLoader: Invalid plugin found: missing name");o[u.name]=u,s[u.name]=!0}if(r.extensionsUsed)for(let l=0;l<r.extensionsUsed.length;++l){let u=r.extensionsUsed[l],d=r.extensionsRequired||[];switch(u){case We.KHR_MATERIALS_UNLIT:s[u]=new a_;break;case We.KHR_DRACO_MESH_COMPRESSION:s[u]=new T_(r,this.dracoLoader);break;case We.KHR_TEXTURE_TRANSFORM:s[u]=new E_;break;case We.KHR_MESH_QUANTIZATION:s[u]=new A_;break;default:if(d.indexOf(u)>=0&&o[u]===void 0)console.warn('THREE.GLTFLoader: Unknown extension "'+u+'".')}}c.setExtensions(s),c.setPlugins(o),c.parse(n,i)}parseAsync(e,t){let n=this;return new Promise(function(i,r){n.parse(e,t,i,r)})}}function nw(){let e={};return{get:function(t){return e[t]},add:function(t,n){e[t]=n},remove:function(t){delete e[t]},removeAll:function(){e={}}}}function Et(e,t,n){let i=e.json.materials[t];if(i.extensions&&i.extensions[n])return i.extensions[n];return null}var We={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class o_{constructor(e){this.parser=e,this.name=We.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){let e=this.parser,t=this.parser.json.nodes||[];for(let n=0,i=t.length;n<i;n++){let r=t[n];if(r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0)e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){let t=this.parser,n="light:"+e,i=t.cache.get(n);if(i)return i;let r=t.json,a=((r.extensions&&r.extensions[this.name]||{}).lights||[])[e],c,l=new Re(16777215);if(a.color!==void 0)l.setRGB(a.color[0],a.color[1],a.color[2],on);let u=a.range!==void 0?a.range:0;switch(a.type){case"directional":c=new ir(l),c.target.position.set(0,0,-1),c.add(c.target);break;case"point":c=new $r(l),c.distance=u;break;case"spot":c=new Wr(l),c.distance=u,a.spot=a.spot||{},a.spot.innerConeAngle=a.spot.innerConeAngle!==void 0?a.spot.innerConeAngle:0,a.spot.outerConeAngle=a.spot.outerConeAngle!==void 0?a.spot.outerConeAngle:Math.PI/4,c.angle=a.spot.outerConeAngle,c.penumbra=1-a.spot.innerConeAngle/a.spot.outerConeAngle,c.target.position.set(0,0,-1),c.add(c.target);break;default:throw Error("THREE.GLTFLoader: Unexpected light type: "+a.type)}if(c.position.set(0,0,0),$n(c,a),a.intensity!==void 0)c.intensity=a.intensity;return c.name=t.createUniqueName(a.name||"light_"+e),i=Promise.resolve(c),t.cache.add(n,i),i}getDependency(e,t){if(e!=="light")return;return this._loadLight(t)}createNodeAttachment(e){let t=this,n=this.parser,r=n.json.nodes[e],o=(r.extensions&&r.extensions[this.name]||{}).light;if(o===void 0)return null;return this._loadLight(o).then(function(a){return n._getNodeRef(t.cache,o,a)})}}class a_{constructor(){this.name=We.KHR_MATERIALS_UNLIT}getMaterialType(){return Bn}extendParams(e,t,n){let i=[];e.color=new Re(1,1,1),e.opacity=1;let r=t.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){let s=r.baseColorFactor;e.color.setRGB(s[0],s[1],s[2],on),e.opacity=s[3]}if(r.baseColorTexture!==void 0)i.push(n.assignTexture(e,"map",r.baseColorTexture,Ti))}return Promise.all(i)}}class c_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();if(n.emissiveStrength!==void 0)t.emissiveIntensity=n.emissiveStrength;return Promise.resolve()}}class l_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.clearcoatFactor!==void 0)t.clearcoat=n.clearcoatFactor;if(n.clearcoatTexture!==void 0)i.push(this.parser.assignTexture(t,"clearcoatMap",n.clearcoatTexture));if(n.clearcoatRoughnessFactor!==void 0)t.clearcoatRoughness=n.clearcoatRoughnessFactor;if(n.clearcoatRoughnessTexture!==void 0)i.push(this.parser.assignTexture(t,"clearcoatRoughnessMap",n.clearcoatRoughnessTexture));if(n.clearcoatNormalTexture!==void 0){if(i.push(this.parser.assignTexture(t,"clearcoatNormalMap",n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale!==void 0){let r=n.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new Ue(r,r)}}return Promise.all(i)}}class u_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_DISPERSION}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();return t.dispersion=n.dispersion!==void 0?n.dispersion:0,Promise.resolve()}}class h_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.iridescenceFactor!==void 0)t.iridescence=n.iridescenceFactor;if(n.iridescenceTexture!==void 0)i.push(this.parser.assignTexture(t,"iridescenceMap",n.iridescenceTexture));if(n.iridescenceIor!==void 0)t.iridescenceIOR=n.iridescenceIor;if(t.iridescenceThicknessRange===void 0)t.iridescenceThicknessRange=[100,400];if(n.iridescenceThicknessMinimum!==void 0)t.iridescenceThicknessRange[0]=n.iridescenceThicknessMinimum;if(n.iridescenceThicknessMaximum!==void 0)t.iridescenceThicknessRange[1]=n.iridescenceThicknessMaximum;if(n.iridescenceThicknessTexture!==void 0)i.push(this.parser.assignTexture(t,"iridescenceThicknessMap",n.iridescenceThicknessTexture));return Promise.all(i)}}class d_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_SHEEN}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.sheenColor=new Re(0,0,0),t.sheenRoughness=0,t.sheen=1,n.sheenColorFactor!==void 0){let r=n.sheenColorFactor;t.sheenColor.setRGB(r[0],r[1],r[2],on)}if(n.sheenRoughnessFactor!==void 0)t.sheenRoughness=n.sheenRoughnessFactor;if(n.sheenColorTexture!==void 0)i.push(this.parser.assignTexture(t,"sheenColorMap",n.sheenColorTexture,Ti));if(n.sheenRoughnessTexture!==void 0)i.push(this.parser.assignTexture(t,"sheenRoughnessMap",n.sheenRoughnessTexture));return Promise.all(i)}}class f_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.transmissionFactor!==void 0)t.transmission=n.transmissionFactor;if(n.transmissionTexture!==void 0)i.push(this.parser.assignTexture(t,"transmissionMap",n.transmissionTexture));return Promise.all(i)}}class p_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_VOLUME}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.thickness=n.thicknessFactor!==void 0?n.thicknessFactor:0,n.thicknessTexture!==void 0)i.push(this.parser.assignTexture(t,"thicknessMap",n.thicknessTexture));t.attenuationDistance=n.attenuationDistance||1/0;let r=n.attenuationColor||[1,1,1];return t.attenuationColor=new Re().setRGB(r[0],r[1],r[2],on),Promise.all(i)}}class m_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_IOR}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();if(t.ior=n.ior!==void 0?n.ior:1.5,t.ior===0)t.ior=1000;return Promise.resolve()}}class g_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_SPECULAR}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.specularIntensity=n.specularFactor!==void 0?n.specularFactor:1,n.specularTexture!==void 0)i.push(this.parser.assignTexture(t,"specularIntensityMap",n.specularTexture));let r=n.specularColorFactor||[1,1,1];if(t.specularColor=new Re().setRGB(r[0],r[1],r[2],on),n.specularColorTexture!==void 0)i.push(this.parser.assignTexture(t,"specularColorMap",n.specularColorTexture,Ti));return Promise.all(i)}}class __{constructor(e){this.parser=e,this.name=We.EXT_MATERIALS_BUMP}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.bumpScale=n.bumpFactor!==void 0?n.bumpFactor:1,n.bumpTexture!==void 0)i.push(this.parser.assignTexture(t,"bumpMap",n.bumpTexture));return Promise.all(i)}}class x_{constructor(e){this.parser=e,this.name=We.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){return Et(this.parser,e,this.name)!==null?ln:null}extendMaterialParams(e,t){let n=Et(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.anisotropyStrength!==void 0)t.anisotropy=n.anisotropyStrength;if(n.anisotropyRotation!==void 0)t.anisotropyRotation=n.anisotropyRotation;if(n.anisotropyTexture!==void 0)i.push(this.parser.assignTexture(t,"anisotropyMap",n.anisotropyTexture));return Promise.all(i)}}class v_{constructor(e){this.parser=e,this.name=We.KHR_TEXTURE_BASISU}loadTexture(e){let t=this.parser,n=t.json,i=n.textures[e];if(!i.extensions||!i.extensions[this.name])return null;let r=i.extensions[this.name],s=t.options.ktx2Loader;if(!s)if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");else return null;return t.loadTextureImage(e,r.source,s)}}class y_{constructor(e){this.parser=e,this.name=We.EXT_TEXTURE_WEBP}loadTexture(e){let t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;let s=r.extensions[t],o=i.images[s.source],a=n.textureLoader;if(o.uri){let c=n.options.manager.getHandler(o.uri);if(c!==null)a=c}return n.loadTextureImage(e,s.source,a)}}class S_{constructor(e){this.parser=e,this.name=We.EXT_TEXTURE_AVIF}loadTexture(e){let t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;let s=r.extensions[t],o=i.images[s.source],a=n.textureLoader;if(o.uri){let c=n.options.manager.getHandler(o.uri);if(c!==null)a=c}return n.loadTextureImage(e,s.source,a)}}class xu{constructor(e,t){this.name=t,this.parser=e}loadBufferView(e){let t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){let i=n.extensions[this.name],r=this.parser.getDependency("buffer",i.buffer),s=this.parser.options.meshoptDecoder;if(!s||!s.supported)if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");else return null;return r.then(function(o){let a=i.byteOffset||0,c=i.byteLength||0,{count:l,byteStride:u}=i,d=new Uint8Array(o,a,c);if(s.decodeGltfBufferAsync)return s.decodeGltfBufferAsync(l,u,d,i.mode,i.filter).then(function(h){return h.buffer});else return s.ready.then(function(){let h=new ArrayBuffer(l*u);return s.decodeGltfBuffer(new Uint8Array(h),l,u,d,i.mode,i.filter),h})})}else return null}}class b_{constructor(e){this.name=We.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){let t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;let i=t.meshes[n.mesh];for(let c of i.primitives)if(c.mode!==xn.TRIANGLES&&c.mode!==xn.TRIANGLE_STRIP&&c.mode!==xn.TRIANGLE_FAN&&c.mode!==void 0)return null;let s=n.extensions[this.name].attributes,o=[],a={};for(let c in s)o.push(this.parser.getDependency("accessor",s[c]).then((l)=>(a[c]=l,a[c])));if(o.length<1)return null;return o.push(this.parser.createNodeMesh(e)),Promise.all(o).then((c)=>{let l=c.pop(),u=l.isGroup?l.children:[l],d=c[0].count,h=[];for(let f of u){let g=new Oe,S=new U,p=new Gt,m=new U(1,1,1),T=new ha(f.geometry,f.material,d);for(let v=0;v<d;v++){if(a.TRANSLATION)S.fromBufferAttribute(a.TRANSLATION,v);if(a.ROTATION)p.fromBufferAttribute(a.ROTATION,v);if(a.SCALE)m.fromBufferAttribute(a.SCALE,v);T.setMatrixAt(v,g.compose(S,p,m))}let A=null;for(let v in a)if(v==="_COLOR_0"){let w=a[v];T.instanceColor=new bi(w.array,w.itemSize,w.normalized)}else if(v!=="TRANSLATION"&&v!=="ROTATION"&&v!=="SCALE"){if(A===null){let E=T.geometry;A=new Mt,A.name=E.name;for(let R in E.attributes)A.setAttribute(R,E.attributes[R]);for(let R in E.morphAttributes)A.morphAttributes[R]=E.morphAttributes[R];if(E.index!==null)A.setIndex(E.index);A.morphTargetsRelative=E.morphTargetsRelative;for(let R of E.groups)A.addGroup(R.start,R.count,R.materialIndex);if(E.boundingBox!==null)A.boundingBox=E.boundingBox.clone();if(E.boundingSphere!==null)A.boundingSphere=E.boundingSphere.clone();A.drawRange.start=E.drawRange.start,A.drawRange.count=E.drawRange.count,A.userData=Object.assign({},E.userData),T.geometry=A}let w=a[v];A.setAttribute(v,new bi(w.array,w.itemSize,w.normalized))}lt.prototype.copy.call(T,f),this.parser.assignFinalMaterial(T),h.push(T)}if(l.isGroup)return l.clear(),l.add(...h),l;return h[0]})}}var M_="glTF",$s=12,n_={JSON:1313821514,BIN:5130562};class w_{constructor(e){this.name=We.KHR_BINARY_GLTF,this.content=null,this.body=null;let t=new DataView(e,0,$s),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==M_)throw Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");else if(this.header.version<2)throw Error("THREE.GLTFLoader: Legacy binary file detected.");let i=this.header.length-$s,r=new DataView(e,$s),s=0;while(s<i){let o=r.getUint32(s,!0);s+=4;let a=r.getUint32(s,!0);if(s+=4,a===n_.JSON){let c=new Uint8Array(e,$s+s,o);this.content=n.decode(c)}else if(a===n_.BIN){let c=$s+s;this.body=e.slice(c,c+o)}s+=o}if(this.content===null)throw Error("THREE.GLTFLoader: JSON content not found.")}}class T_{constructor(e,t){if(!t)throw Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=We.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){let n=this.json,i=this.dracoLoader,r=e.extensions[this.name].bufferView,s=e.extensions[this.name].attributes,o={},a={},c={};for(let l in s){let u=vu[l]||l.toLowerCase();o[u]=s[l]}for(let l in e.attributes){let u=vu[l]||l.toLowerCase();if(s[l]!==void 0){let d=n.accessors[e.attributes[l]],h=Yr[d.componentType];c[u]=h.name,a[u]=d.normalized===!0}}return t.getDependency("bufferView",r).then(function(l){return new Promise(function(u,d){i.decodeDracoFile(l,function(h){for(let f in h.attributes){let g=h.attributes[f],S=a[f];if(S!==void 0)g.normalized=S}u(h)},o,c,on,d)})})}}class E_{constructor(){this.name=We.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){if((t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0)return e;if(e=e.clone(),t.texCoord!==void 0)e.channel=t.texCoord;if(t.offset!==void 0)e.offset.fromArray(t.offset);if(t.rotation!==void 0)e.rotation=t.rotation;if(t.scale!==void 0)e.repeat.fromArray(t.scale);if(t.rotation!==void 0){let n=Math.cos(e.rotation),i=Math.sin(e.rotation);e.matrix.set(e.repeat.x*n,e.repeat.y*i,e.offset.x,-e.repeat.x*i,e.repeat.y*n,e.offset.y,0,0,1),e.matrixAutoUpdate=!1}return e.needsUpdate=!0,e}}class A_{constructor(){this.name=We.KHR_MESH_QUANTIZATION}}class bu extends oi{constructor(e,t,n,i){super(e,t,n,i)}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i*3+i;for(let s=0;s!==i;s++)t[s]=n[r+s];return t}interpolate_(e,t,n,i){let r=this.resultBuffer,s=this.sampleValues,o=this.valueSize,a=o*2,c=o*3,l=i-t,u=(n-t)/l,d=u*u,h=d*u,f=e*c,g=f-c,S=-2*h+3*d,p=h-d,m=1-S,T=p-d+u;for(let A=0;A!==o;A++){let v=s[g+A+o],w=s[g+A+a]*l,E=s[f+A+o],R=s[f+A]*l;r[A]=m*v+T*w+S*E+p*R}return r}}var iw=new Gt;class R_ extends bu{interpolate_(e,t,n,i){let r=super.interpolate_(e,t,n,i);return iw.fromArray(r).normalize().toArray(r),r}}var xn={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},Yr={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},i_={9728:Tn,9729:zt,9984:Ko,9985:zr,9986:Xi,9987:On},r_={33071:Fr,33648:Jo,10497:Or},mu={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},vu={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Ni={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},rw={CUBICSPLINE:void 0,LINEAR:ra,STEP:Rl},gu={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function sw(e){if(e.DefaultMaterial===void 0)e.DefaultMaterial=new Gn({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Mi});return e.DefaultMaterial}function sr(e,t,n){for(let i in n.extensions)if(e[i]===void 0)t.userData.gltfExtensions=t.userData.gltfExtensions||{},t.userData.gltfExtensions[i]=n.extensions[i]}function $n(e,t){if(t.extras!==void 0)if(typeof t.extras==="object")Object.assign(e.userData,t.extras);else console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+t.extras)}function ow(e,t,n){let i=!1,r=!1,s=!1;for(let l=0,u=t.length;l<u;l++){let d=t[l];if(d.POSITION!==void 0)i=!0;if(d.NORMAL!==void 0)r=!0;if(d.COLOR_0!==void 0)s=!0;if(i&&r&&s)break}if(!i&&!r&&!s)return Promise.resolve(e);let o=[],a=[],c=[];for(let l=0,u=t.length;l<u;l++){let d=t[l];if(i){let h=d.POSITION!==void 0?n.getDependency("accessor",d.POSITION):e.attributes.position;o.push(h)}if(r){let h=d.NORMAL!==void 0?n.getDependency("accessor",d.NORMAL):e.attributes.normal;a.push(h)}if(s){let h=d.COLOR_0!==void 0?n.getDependency("accessor",d.COLOR_0):e.attributes.color;c.push(h)}}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c)]).then(function(l){let u=l[0],d=l[1],h=l[2];if(i)e.morphAttributes.position=u;if(r)e.morphAttributes.normal=d;if(s)e.morphAttributes.color=h;return e.morphTargetsRelative=!0,e})}function aw(e,t){if(e.updateMorphTargets(),t.weights!==void 0)for(let n=0,i=t.weights.length;n<i;n++)e.morphTargetInfluences[n]=t.weights[n];if(t.extras&&Array.isArray(t.extras.targetNames)){let n=t.extras.targetNames;if(e.morphTargetInfluences.length===n.length){e.morphTargetDictionary={};for(let i=0,r=n.length;i<r;i++)e.morphTargetDictionary[n[i]]=i}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function cw(e){let t,n=e.extensions&&e.extensions[We.KHR_DRACO_MESH_COMPRESSION];if(n)t="draco:"+n.bufferView+":"+n.indices+":"+_u(n.attributes);else t=e.indices+":"+_u(e.attributes)+":"+e.mode;if(e.targets!==void 0)for(let i=0,r=e.targets.length;i<r;i++)t+=":"+_u(e.targets[i]);return t}function _u(e){let t="",n=Object.keys(e).sort();for(let i=0,r=n.length;i<r;i++)t+=n[i]+":"+e[n[i]]+";";return t}function yu(e){switch(e){case Int8Array:return 0.007874015748031496;case Uint8Array:return 0.00392156862745098;case Int16Array:return 0.00003051850947599719;case Uint16Array:return 0.000015259021896696422;default:throw Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function lw(e){if(e.search(/\.jpe?g($|\?)/i)>0||e.search(/^data\:image\/jpeg/)===0)return"image/jpeg";if(e.search(/\.webp($|\?)/i)>0||e.search(/^data\:image\/webp/)===0)return"image/webp";if(e.search(/\.ktx2($|\?)/i)>0||e.search(/^data\:image\/ktx2/)===0)return"image/ktx2";return"image/png"}var uw=new Oe;class C_{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new nw,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=-1,r=!1,s=-1;if(typeof navigator<"u"&&typeof navigator.userAgent<"u"){let o=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(o)===!0;let a=o.match(/Version\/(\d+)/);i=n&&a?parseInt(a[1],10):-1,r=o.indexOf("Firefox")>-1,s=r?o.match(/Firefox\/([0-9]+)\./)[1]:-1}if(typeof createImageBitmap>"u"||n&&i<17||r&&s<98)this.textureLoader=new _a(this.options.manager);else this.textureLoader=new ya(this.options.manager);if(this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new ks(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials")this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){let n=this,i=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(s){return s._markDefs&&s._markDefs()}),Promise.all(this._invokeAll(function(s){return s.beforeRoot&&s.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(s){let o={scene:s[0][i.scene||0],scenes:s[0],animations:s[1],cameras:s[2],asset:i.asset,parser:n,userData:{}};return sr(r,o,i),$n(o,i),Promise.all(n._invokeAll(function(a){return a.afterRoot&&a.afterRoot(o)})).then(function(){for(let a of o.scenes)a.updateMatrixWorld();e(o)})}).catch(t)}_markDefs(){let e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let i=0,r=t.length;i<r;i++){let s=t[i].joints;for(let o=0,a=s.length;o<a;o++)e[s[o]].isBone=!0}for(let i=0,r=e.length;i<r;i++){let s=e[i];if(s.mesh!==void 0){if(this._addNodeRef(this.meshCache,s.mesh),s.skin!==void 0)n[s.mesh].isSkinnedMesh=!0}if(s.camera!==void 0)this._addNodeRef(this.cameraCache,s.camera)}}_addNodeRef(e,t){if(t===void 0)return;if(e.refs[t]===void 0)e.refs[t]=e.uses[t]=0;e.refs[t]++}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;let i=n.clone(),r=(s,o)=>{let a=this.associations.get(s);if(a!=null)this.associations.set(o,a);for(let[c,l]of s.children.entries())r(l,o.children[c])};return r(n,i),i.name+="_instance_"+e.uses[t]++,i}_invokeOne(e){let t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){let i=e(t[n]);if(i)return i}return null}_invokeAll(e){let t=Object.values(this.plugins);t.unshift(this);let n=[];for(let i=0;i<t.length;i++){let r=e(t[i]);if(r)n.push(r)}return n}getDependency(e,t){let n=e+":"+t,i=this.cache.get(n);if(!i){switch(e){case"scene":i=this.loadScene(t);break;case"node":i=this._invokeOne(function(r){return r.loadNode&&r.loadNode(t)});break;case"mesh":i=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(t)});break;case"accessor":i=this.loadAccessor(t);break;case"bufferView":i=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(t)});break;case"buffer":i=this.loadBuffer(t);break;case"material":i=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(t)});break;case"texture":i=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(t)});break;case"skin":i=this.loadSkin(t);break;case"animation":i=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(t)});break;case"camera":i=this.loadCamera(t);break;default:if(i=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(e,t)}),!i)throw Error("Unknown type: "+e);break}this.cache.add(n,i)}return i}getDependencies(e){let t=this.cache.get(e);if(!t){let n=this,i=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(i.map(function(r,s){return n.getDependency(e,s)})),this.cache.add(e,t)}return t}loadBuffer(e){let t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[We.KHR_BINARY_GLTF].body);let i=this.options;return new Promise(function(r,s){n.load(Li.resolveURL(t.uri,i.path),r,void 0,function(){s(Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){let t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(n){let i=t.byteLength||0,r=t.byteOffset||0;return n.slice(r,r+i)})}loadAccessor(e){let t=this,n=this.json,i=this.json.accessors[e];if(i.bufferView===void 0&&i.sparse===void 0){let s=mu[i.type],o=Yr[i.componentType],a=i.normalized===!0,c=new o(i.count*s);return Promise.resolve(new Ft(c,s,a))}let r=[];if(i.bufferView!==void 0)r.push(this.getDependency("bufferView",i.bufferView));else r.push(null);if(i.sparse!==void 0)r.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",i.sparse.values.bufferView));return Promise.all(r).then(function(s){let o=s[0],a=mu[i.type],c=Yr[i.componentType],l=c.BYTES_PER_ELEMENT,u=l*a,d=i.byteOffset||0,h=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,f=i.normalized===!0,g,S;if(h&&h!==u){let p=Math.floor(d/h),m="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+p+":"+i.count,T=t.cache.get(m);if(!T)g=new c(o,p*h,i.count*h/l),T=new Gr(g,h/l),t.cache.add(m,T);S=new Si(T,a,d%h/l,f)}else{if(o===null)g=new c(i.count*a);else g=new c(o,d,i.count*a);S=new Ft(g,a,f)}if(i.sparse!==void 0){let p=mu.SCALAR,m=Yr[i.sparse.indices.componentType],T=i.sparse.indices.byteOffset||0,A=i.sparse.values.byteOffset||0,v=new m(s[1],T,i.sparse.count*p),w=new c(s[2],A,i.sparse.count*a);if(o!==null)S=new Ft(S.array.slice(),S.itemSize,S.normalized);S.normalized=!1;for(let E=0,R=v.length;E<R;E++){let x=v[E];if(S.setX(x,w[E*a]),a>=2)S.setY(x,w[E*a+1]);if(a>=3)S.setZ(x,w[E*a+2]);if(a>=4)S.setW(x,w[E*a+3]);if(a>=5)throw Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}S.normalized=f}return S})}loadTexture(e){let t=this.json,n=this.options,r=t.textures[e].source,s=t.images[r],o=this.textureLoader;if(s.uri){let a=n.manager.getHandler(s.uri);if(a!==null)o=a}return this.loadTextureImage(e,r,o)}loadTextureImage(e,t,n){let i=this,r=this.json,s=r.textures[e],o=r.images[t],a=(o.uri||o.bufferView)+":"+s.sampler;if(this.textureCache[a])return this.textureCache[a];let c=this.loadImageSource(t,n).then(function(l){if(l.flipY=!1,l.name=s.name||o.name||"",l.name===""&&typeof o.uri==="string"&&o.uri.startsWith("data:image/")===!1)l.name=o.uri;let d=(r.samplers||{})[s.sampler]||{};return l.magFilter=i_[d.magFilter]||zt,l.minFilter=i_[d.minFilter]||On,l.wrapS=r_[d.wrapS]||Or,l.wrapT=r_[d.wrapT]||Or,l.generateMipmaps=!l.isCompressedTexture&&l.minFilter!==Tn&&l.minFilter!==zt,i.associations.set(l,{textures:e}),l}).catch(function(){return null});return this.textureCache[a]=c,c}loadImageSource(e,t){let n=this,i=this.json,r=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then((u)=>u.clone());let s=i.images[e],o=self.URL||self.webkitURL,a=s.uri||"",c=!1;if(s.bufferView!==void 0)a=n.getDependency("bufferView",s.bufferView).then(function(u){c=!0;let d=new Blob([u],{type:s.mimeType});return a=o.createObjectURL(d),a});else if(s.uri===void 0)throw Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");let l=Promise.resolve(a).then(function(u){return new Promise(function(d,h){let f=d;if(t.isImageBitmapLoader===!0)f=function(g){let S=new _t(g);S.needsUpdate=!0,d(S)};t.load(Li.resolveURL(u,r.path),f,void 0,h)})}).then(function(u){if(c===!0)o.revokeObjectURL(a);return $n(u,s),u.userData.mimeType=s.mimeType||lw(s.uri),u}).catch(function(u){throw console.error("THREE.GLTFLoader: Couldn't load texture",a),u});return this.sourceCache[e]=l,l}assignTexture(e,t,n,i){let r=this;return this.getDependency("texture",n.index).then(function(s){if(!s)return null;if(n.texCoord!==void 0&&n.texCoord>0)s=s.clone(),s.channel=n.texCoord;if(r.extensions[We.KHR_TEXTURE_TRANSFORM]){let o=n.extensions!==void 0?n.extensions[We.KHR_TEXTURE_TRANSFORM]:void 0;if(o){let a=r.associations.get(s);s=r.extensions[We.KHR_TEXTURE_TRANSFORM].extendTexture(s,o),r.associations.set(s,a)}}if(i!==void 0)s.colorSpace=i;return e[t]=s,s})}assignFinalMaterial(e){let{geometry:t,material:n}=e,i=t.attributes.tangent===void 0,r=t.attributes.color!==void 0,s=t.attributes.normal===void 0;if(e.isPoints){let o="PointsMaterial:"+n.uuid,a=this.cache.get(o);if(!a)a=new Ds,Qt.prototype.copy.call(a,n),a.color.copy(n.color),a.map=n.map,a.sizeAttenuation=!1,this.cache.add(o,a);n=a}else if(e.isLine){let o="LineBasicMaterial:"+n.uuid,a=this.cache.get(o);if(!a)a=new Ei,Qt.prototype.copy.call(a,n),a.color.copy(n.color),a.map=n.map,this.cache.add(o,a);n=a}if(i||r||s){let o="ClonedMaterial:"+n.uuid+":";if(i)o+="derivative-tangents:";if(r)o+="vertex-colors:";if(s)o+="flat-shading:";let a=this.cache.get(o);if(!a){if(a=n.clone(),r)a.vertexColors=!0;if(s)a.flatShading=!0;if(i){if(a.normalScale)a.normalScale.y*=-1;if(a.clearcoatNormalScale)a.clearcoatNormalScale.y*=-1}this.cache.add(o,a),this.associations.set(a,this.associations.get(n))}n=a}e.material=n}getMaterialType(){return Gn}loadMaterial(e){let t=this,n=this.json,i=this.extensions,r=n.materials[e],s,o={},a=r.extensions||{},c=[];if(a[We.KHR_MATERIALS_UNLIT]){let u=i[We.KHR_MATERIALS_UNLIT];s=u.getMaterialType(),c.push(u.extendParams(o,r,t))}else{let u=r.pbrMetallicRoughness||{};if(o.color=new Re(1,1,1),o.opacity=1,Array.isArray(u.baseColorFactor)){let d=u.baseColorFactor;o.color.setRGB(d[0],d[1],d[2],on),o.opacity=d[3]}if(u.baseColorTexture!==void 0)c.push(t.assignTexture(o,"map",u.baseColorTexture,Ti));if(o.metalness=u.metallicFactor!==void 0?u.metallicFactor:1,o.roughness=u.roughnessFactor!==void 0?u.roughnessFactor:1,u.metallicRoughnessTexture!==void 0)c.push(t.assignTexture(o,"metalnessMap",u.metallicRoughnessTexture)),c.push(t.assignTexture(o,"roughnessMap",u.metallicRoughnessTexture));s=this._invokeOne(function(d){return d.getMaterialType&&d.getMaterialType(e)}),c.push(Promise.all(this._invokeAll(function(d){return d.extendMaterialParams&&d.extendMaterialParams(e,o)})))}if(r.doubleSided===!0)o.side=mn;let l=r.alphaMode||gu.OPAQUE;if(l===gu.BLEND)o.transparent=!0,o.depthWrite=!1;else if(o.transparent=!1,l===gu.MASK)o.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:0.5;if(r.normalTexture!==void 0&&s!==Bn){if(c.push(t.assignTexture(o,"normalMap",r.normalTexture)),o.normalScale=new Ue(1,1),r.normalTexture.scale!==void 0){let u=r.normalTexture.scale;o.normalScale.set(u,u)}}if(r.occlusionTexture!==void 0&&s!==Bn){if(c.push(t.assignTexture(o,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0)o.aoMapIntensity=r.occlusionTexture.strength}if(r.emissiveFactor!==void 0&&s!==Bn){let u=r.emissiveFactor;o.emissive=new Re().setRGB(u[0],u[1],u[2],on)}if(r.emissiveTexture!==void 0&&s!==Bn)c.push(t.assignTexture(o,"emissiveMap",r.emissiveTexture,Ti));return Promise.all(c).then(function(){let u=new s(o);if(r.name)u.name=r.name;if($n(u,r),t.associations.set(u,{materials:e}),r.extensions)sr(i,u,r);return u})}createUniqueName(e){let t=Qe.sanitizeNodeName(e||"");if(t in this.nodeNamesUsed)return t+"_"+ ++this.nodeNamesUsed[t];else return this.nodeNamesUsed[t]=0,t}loadGeometries(e){let t=this,n=this.extensions,i=this.primitiveCache;function r(o){return n[We.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(o,t).then(function(a){return s_(a,o,t)})}let s=[];for(let o=0,a=e.length;o<a;o++){let c=e[o],l=cw(c),u=i[l];if(u)s.push(u.promise);else{let d;if(c.extensions&&c.extensions[We.KHR_DRACO_MESH_COMPRESSION])d=r(c);else d=s_(new Mt,c,t);if(c.mode===xn.TRIANGLE_STRIP)d=d.then((h)=>pu(h,ws));else if(c.mode===xn.TRIANGLE_FAN)d=d.then((h)=>pu(h,Br));i[l]={primitive:c,promise:d},s.push(d)}}return Promise.all(s)}loadMesh(e){let t=this,n=this.json,i=this.extensions,r=n.meshes[e],s=r.primitives,o=[];for(let a=0,c=s.length;a<c;a++){let l=s[a].material===void 0?sw(this.cache):this.getDependency("material",s[a].material);o.push(l)}return o.push(t.loadGeometries(s)),Promise.all(o).then(async function(a){let c=a.slice(0,a.length-1),l=a[a.length-1],u=[];for(let h=0,f=l.length;h<f;h++){let g=l[h],S=s[h],p,m=c[h];if(S.mode===xn.TRIANGLES||S.mode===xn.TRIANGLE_STRIP||S.mode===xn.TRIANGLE_FAN||S.mode===void 0){let T=r.isSkinnedMesh===!0,A=g.hasAttribute("skinIndex")&&g.hasAttribute("skinWeight");if(T&&A===!1)console.warn("THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled.");if(p=T&&A?new Hr(g,m):new xt(g,m),p.isSkinnedMesh===!0)p.normalizeSkinWeights()}else if(S.mode===xn.LINES)p=new Ns(g,m);else if(S.mode===xn.LINE_STRIP)p=new An(g,m);else if(S.mode===xn.LINE_LOOP)p=new da(g,m);else if(S.mode===xn.POINTS)p=new Ai(g,m);else throw Error("THREE.GLTFLoader: Primitive mode unsupported: "+S.mode);if(Object.keys(p.geometry.morphAttributes).length>0)aw(p,r);if(p.name=t.createUniqueName(r.name||"mesh_"+e),$n(p,r),S.extensions)sr(i,p,S);t.assignFinalMaterial(p),u.push(p)}for(let h=0,f=u.length;h<f;h++)t.associations.set(u[h],{meshes:e,primitives:h});if(u.length===1){if(r.extensions)sr(i,u[0],r);return u[0]}let d=new Kt;if(r.extensions)sr(i,d,r);t.associations.set(d,{meshes:e});for(let h=0,f=u.length;h<f;h++)d.add(u[h]);return d})}loadCamera(e){let t,n=this.json.cameras[e],i=n[n.type];if(!i){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}if(n.type==="perspective")t=new Lt(gn.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2000000);else if(n.type==="orthographic")t=new nr(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar);if(n.name)t.name=this.createUniqueName(n.name);return $n(t,n),Promise.resolve(t)}loadSkin(e){let t=this.json.skins[e],n=[];for(let i=0,r=t.joints.length;i<r;i++)n.push(this._loadNodeShallow(t.joints[i]));if(t.inverseBindMatrices!==void 0)n.push(this.getDependency("accessor",t.inverseBindMatrices));else n.push(null);return Promise.all(n).then(function(i){let r=i.pop(),s=i,o=[],a=[];for(let c=0,l=s.length;c<l;c++){let u=s[c];if(u){o.push(u);let d=new Oe;if(r!==null)d.fromArray(r.array,c*16);a.push(d)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[c])}return new Ps(o,a)})}loadAnimation(e){let t=this.json,n=this,i=t.animations[e],r=i.name?i.name:"animation_"+e,s=[],o=[],a=[],c=[],l=[];for(let u=0,d=i.channels.length;u<d;u++){let h=i.channels[u],f=i.samplers[h.sampler],g=h.target,S=g.node,p=i.parameters!==void 0?i.parameters[f.input]:f.input,m=i.parameters!==void 0?i.parameters[f.output]:f.output;if(g.node===void 0)continue;s.push(this.getDependency("node",S)),o.push(this.getDependency("accessor",p)),a.push(this.getDependency("accessor",m)),c.push(f),l.push(g)}return Promise.all([Promise.all(s),Promise.all(o),Promise.all(a),Promise.all(c),Promise.all(l)]).then(function(u){let d=u[0],h=u[1],f=u[2],g=u[3],S=u[4],p=[];for(let T=0,A=d.length;T<A;T++){let v=d[T],w=h[T],E=f[T],R=g[T],x=S[T];if(v===void 0)continue;if(v.updateMatrix)v.updateMatrix();let M=n._createAnimationTracks(v,w,E,R,x);if(M)for(let H=0;H<M.length;H++)p.push(M[H])}let m=new ri(r,void 0,p);return $n(m,i),m})}createNodeMesh(e){let t=this.json,n=this,i=t.nodes[e];if(i.mesh===void 0)return null;return n.getDependency("mesh",i.mesh).then(function(r){let s=n._getNodeRef(n.meshCache,i.mesh,r);if(i.weights!==void 0)s.traverse(function(o){if(!o.isMesh)return;for(let a=0,c=i.weights.length;a<c;a++)o.morphTargetInfluences[a]=i.weights[a]});return s})}loadNode(e){let t=this.json,n=this,i=t.nodes[e],r=n._loadNodeShallow(e),s=[],o=i.children||[];for(let c=0,l=o.length;c<l;c++)s.push(n.getDependency("node",o[c]));let a=i.skin===void 0?Promise.resolve(null):n.getDependency("skin",i.skin);return Promise.all([r,Promise.all(s),a]).then(function(c){let l=c[0],u=c[1],d=c[2];if(d!==null)l.traverse(function(h){if(!h.isSkinnedMesh)return;h.bind(d,uw)});for(let h=0,f=u.length;h<f;h++)l.add(u[h]);if(l.userData.pivot!==void 0&&u.length>0){let h=l.userData.pivot,f=u[0];l.pivot=new U().fromArray(h),l.position.x-=h[0],l.position.y-=h[1],l.position.z-=h[2],f.position.set(0,0,0),delete l.userData.pivot}return l})}_loadNodeShallow(e){let t=this.json,n=this.extensions,i=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];let r=t.nodes[e],s=r.name?i.createUniqueName(r.name):"",o=[],a=i._invokeOne(function(c){return c.createNodeMesh&&c.createNodeMesh(e)});if(a)o.push(a);if(r.camera!==void 0)o.push(i.getDependency("camera",r.camera).then(function(c){return i._getNodeRef(i.cameraCache,r.camera,c)}));return i._invokeAll(function(c){return c.createNodeAttachment&&c.createNodeAttachment(e)}).forEach(function(c){o.push(c)}),this.nodeCache[e]=Promise.all(o).then(function(c){let l;if(r.isBone===!0)l=new Cs;else if(c.length>1)l=new Kt;else if(c.length===1)l=c[0];else l=new lt;if(l!==c[0])for(let u=0,d=c.length;u<d;u++)l.add(c[u]);if(r.name)l.userData.name=r.name,l.name=s;if($n(l,r),r.extensions)sr(n,l,r);if(r.matrix!==void 0){let u=new Oe;u.fromArray(r.matrix),l.applyMatrix4(u)}else{if(r.translation!==void 0)l.position.fromArray(r.translation);if(r.rotation!==void 0)l.quaternion.fromArray(r.rotation);if(r.scale!==void 0)l.scale.fromArray(r.scale)}if(!i.associations.has(l))i.associations.set(l,{});else if(r.mesh!==void 0&&i.meshCache.refs[r.mesh]>1){let u=i.associations.get(l);i.associations.set(l,{...u})}return i.associations.get(l).nodes=e,l}),this.nodeCache[e]}loadScene(e){let t=this.extensions,n=this.json.scenes[e],i=this,r=new Kt;if(n.name)r.name=i.createUniqueName(n.name);if($n(r,n),n.extensions)sr(t,r,n);let s=n.nodes||[],o=[];for(let a=0,c=s.length;a<c;a++)o.push(i.getDependency("node",s[a]));return Promise.all(o).then(function(a){for(let l=0,u=a.length;l<u;l++){let d=a[l];if(d.parent!==null)r.add(e_(d));else r.add(d)}let c=(l)=>{let u=new Map;for(let[d,h]of i.associations)if(d instanceof Qt||d instanceof _t)u.set(d,h);return l.traverse((d)=>{let h=i.associations.get(d);if(h!=null)u.set(d,h)}),u};return i.associations=c(r),r})}_createAnimationTracks(e,t,n,i,r){let s=[],o=e.name?e.name:e.uuid,a=[];function c(h){if(h.morphTargetInfluences)a.push(h.name?h.name:h.uuid)}if(Ni[r.path]===Ni.weights){if(c(e),e.isGroup)e.children.forEach(c)}else a.push(o);let l;switch(Ni[r.path]){case Ni.weights:l=Ii;break;case Ni.rotation:l=Rn;break;case Ni.translation:case Ni.scale:l=Hn;break;default:switch(n.itemSize){case 1:l=Ii;break;case 2:case 3:default:l=Hn;break}break}let u=i.interpolation!==void 0?rw[i.interpolation]:ra,d=this._getArrayFromAccessor(n);for(let h=0,f=a.length;h<f;h++){let g=new l(a[h]+"."+Ni[r.path],t.array,d,u);if(i.interpolation==="CUBICSPLINE")this._createCubicSplineTrackInterpolant(g);s.push(g)}return s}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){let n=yu(t.constructor),i=new Float32Array(t.length);for(let r=0,s=t.length;r<s;r++)i[r]=t[r]*n;t=i}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(n){return new(this instanceof Rn?R_:bu)(this.times,this.values,this.getValueSize()/3,n)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function hw(e,t,n){let i=t.attributes,r=new _n;if(i.POSITION!==void 0){let a=n.json.accessors[i.POSITION],{min:c,max:l}=a;if(c!==void 0&&l!==void 0){if(r.set(new U(c[0],c[1],c[2]),new U(l[0],l[1],l[2])),a.normalized){let u=yu(Yr[a.componentType]);r.min.multiplyScalar(u),r.max.multiplyScalar(u)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;let s=t.targets;if(s!==void 0){let a=new U,c=new U;for(let l=0,u=s.length;l<u;l++){let d=s[l];if(d.POSITION!==void 0){let h=n.json.accessors[d.POSITION],{min:f,max:g}=h;if(f!==void 0&&g!==void 0){if(c.setX(Math.max(Math.abs(f[0]),Math.abs(g[0]))),c.setY(Math.max(Math.abs(f[1]),Math.abs(g[1]))),c.setZ(Math.max(Math.abs(f[2]),Math.abs(g[2]))),h.normalized){let S=yu(Yr[h.componentType]);c.multiplyScalar(S)}a.max(c)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}r.expandByVector(a)}e.boundingBox=r;let o=new cn;r.getCenter(o.center),o.radius=r.min.distanceTo(r.max)/2,e.boundingSphere=o}function s_(e,t,n){let i=t.attributes,r=[];function s(o,a){return n.getDependency("accessor",o).then(function(c){e.setAttribute(a,c)})}for(let o in i){let a=vu[o]||o.toLowerCase();if(a in e.attributes)continue;r.push(s(i[o],a))}if(t.indices!==void 0&&!e.index){let o=n.getDependency("accessor",t.indices).then(function(a){e.setIndex(a)});r.push(o)}if(He.workingColorSpace!==on&&"COLOR_0"in i)console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${He.workingColorSpace}" not supported.`);return $n(e,t),hw(e,t,n),Promise.all(r).then(function(){return t.targets!==void 0?ow(e,t.targets,n):e})}function Mu(e,t,n){if(!e.length)return n;let i=[...e].sort((c,l)=>c.time-l.time);if(t<=i[0].time)return{...i[0],time:t};let r=i.findIndex((c)=>c.time>t);if(r<0)return{...i.at(-1)||n,time:t};let s=i[r-1],o=i[r],a=(t-s.time)/(o.time-s.time);return{time:t,x:s.x+(o.x-s.x)*a,y:s.y+(o.y-s.y)*a,z:s.z+(o.z-s.z)*a,yaw:s.yaw+(o.yaw-s.yaw)*a}}function I_(e){let t=new Set,n=new Set,i=new Set,r=new Set,s=new Set;e.traverse((o)=>{if(o instanceof xt||o instanceof An||o instanceof Ai)t.add(o.geometry);if(o instanceof xt||o instanceof An||o instanceof Ai||o instanceof ua)for(let a of Array.isArray(o.material)?o.material:[o.material])n.add(a);if(o instanceof Hr)r.add(o.skeleton);if(o instanceof ir||o instanceof $r||o instanceof Wr)o.shadow.dispose()});for(let o of n){for(let a of Object.values(o))if(a instanceof _t)i.add(a);if(o instanceof en)for(let a of Object.values(o.uniforms)){let c=Array.isArray(a.value)?a.value:[a.value];for(let l of c)if(l instanceof _t)i.add(l)}}if(e instanceof Rs){if(e.background instanceof _t)i.add(e.background);if(e.environment)i.add(e.environment)}for(let o of t)o.dispose();for(let o of i){o.dispose();for(let a of Array.isArray(o.image)?o.image:[o.image])if(typeof ImageBitmap<"u"&&a instanceof ImageBitmap)s.add(a)}for(let o of s)o.close();for(let o of r)o.dispose();for(let o of n)o.dispose()}function P_(e,t,n,i={}){let r=t.advanced||{models:[],tracks:[],showPaths:!0},s=i.translate||((D)=>D),o=0,a=!1,c=new Rs;c.background=new Re("#14191f");let l=i.width||640,u=i.height||360,d=new Lt(t.camera.fov,l/u,0.1,200);d.name="__camera__",c.add(d);let h;try{h=new fu({antialias:!0,preserveDrawingBuffer:!0})}catch{throw Error(s("WebGL is unavailable; use simple composition"))}h.setSize(l,u),h.domElement.style.width="100%",h.domElement.style.height="auto",e.appendChild(h.domElement),c.add(new xa(16777215,3359829,2));let f=new ir(16777215,3);f.position.set(5,8,4),c.add(f),c.add(new Ma(20,20,7372944,3029832));let g=new Map,S=[],p=[],m=new Map;for(let D of t.actors){let C=new Kt;C.name=D.id;let F=new Gn({color:D.color}),Z=new xt(new er(0.2,0.8,4,8),F);Z.position.y=D.pose==="sit"?0.65:1,C.add(Z);let G=new xt(new Os(0.17,12,8),F);G.position.y=D.pose==="sit"?1.05:1.7,C.add(G);for(let ie of[-1,1]){let X=new Kt;X.name=ie<0?"left_arm":"right_arm",X.position.set(ie*0.3,D.pose==="sit"?0.95:1.4,0);let Q=new xt(new er(0.07,0.35,4,6),F);Q.position.y=-0.22,X.add(Q),C.add(X);let ee=new Kt;ee.name=ie<0?"left_leg":"right_leg",ee.position.set(ie*0.12,D.pose==="sit"?0.6:0.75,0);let ve=new xt(new er(0.08,0.55,4,6),F);ve.position.y=-0.28,ee.add(ve),C.add(ee)}c.add(C),g.set(D.id,C),m.set(D.id,{time:0,x:D.x,y:0,z:D.z,yaw:D.yaw})}for(let D of t.props){let C=new xt(new Ri(D.width,D.height,D.depth),new Gn({color:D.color}));C.name=D.id,c.add(C),g.set(D.id,C),m.set(D.id,{time:0,x:D.x,y:D.height/2,z:D.z,yaw:0})}for(let D of r.tracks){if(D.targetId==="__camera__")continue;let C=[...D.keys].sort((F,Z)=>F.time-Z.time);if(C.length<2)continue;if(p.push(new ri(D.targetId,t.duration,[new Hn(`${D.targetId}.position`,C.map((F)=>F.time),C.flatMap((F)=>[F.x,F.y,F.z])),new Rn(`${D.targetId}.quaternion`,C.map((F)=>F.time),C.flatMap((F)=>new Gt().setFromAxisAngle(new U(0,1,0),gn.degToRad(F.yaw)).toArray()))])),r.showPaths)c.add(new An(new Mt().setFromPoints(C.map((F)=>new U(F.x,F.y,F.z))),new Ei({color:56831})))}let T=(D)=>{if(a)return;o=D;let C=D/t.duration;for(let[X,Q]of g){let ee=m.get(X);if(!ee)continue;let ve=t.actors.find((qe)=>qe.id===X);if(ve)ee={...ee,x:ve.x+(ve.endX-ve.x)*C,z:ve.z+(ve.endZ-ve.z)*C};let Ee=Mu(r.tracks.find((qe)=>qe.targetId===X)?.keys||[],D,ee);if(Q.position.set(Ee.x,Ee.y,Ee.z),Q.rotation.y=gn.degToRad(Ee.yaw),ve){let qe=ve.pose==="walk"?Math.sin(D*8)*0.5:0,ke=Q.getObjectByName("left_arm"),q=Q.getObjectByName("right_arm"),re=Q.getObjectByName("left_leg"),se=Q.getObjectByName("right_leg");if(ke)ke.rotation.set(qe,0,0);if(q){if(q.rotation.set(-qe,0,0),ve.pose==="wave")q.rotation.z=2.8+Math.sin(D*8)*0.15;if(ve.pose==="point")q.rotation.x=-Math.PI/2}if(re)re.rotation.x=ve.pose==="sit"?-Math.PI/2:-qe;if(se)se.rotation.x=ve.pose==="sit"?-Math.PI/2:qe}}for(let X of S)X.setTime(D);let F=Mu(r.tracks.find((X)=>X.targetId==="__camera__")?.keys||[],D,{time:D,x:0,y:0,z:0,yaw:t.camera.yaw+(t.camera.endYaw-t.camera.yaw)*C}),Z=gn.degToRad(F.yaw),G=gn.degToRad(t.camera.pitch),ie=g.get(r.followId||"")?.position||new U;d.position.set(Math.sin(Z)*t.camera.distance*Math.cos(G)+ie.x+F.x,Math.sin(G)*t.camera.distance+1+ie.y+F.y,Math.cos(Z)*t.camera.distance*Math.cos(G)+ie.z+F.z),d.lookAt(g.get(r.lookAtId||"")?.position.clone().add(new U(0,1,0))||ie.clone().add(new U(0,1,0))),h.render(c,d)},A=[...new Set([0,t.duration,...r.tracks.find((D)=>D.targetId==="__camera__")?.keys.map((D)=>D.time)||[]])].sort((D,C)=>D-C),v=[],w=[];for(let D of A)T(D),v.push(...d.position.toArray()),w.push(...d.quaternion.toArray());p.push(new ri("Camera movement",t.duration,[new Hn("__camera__.position",A,v),new Rn("__camera__.quaternion",A,w)]));let E={renderer:h,scene:c,camera:d,update:T,clips:p,ready:Promise.resolve()};T(o);let R=new zs;R.setURLModifier((D)=>{if(!D.startsWith("data:")&&!D.startsWith("blob:"))throw Error("GLB external resources are not supported");return D});let x=new Su(R),M=Promise.all(r.models.map(async(D)=>{let C=await n(D.modelMediaId);if(a)return;if(!C)throw Error(s("Stored 3D model is unavailable"));let F=await x.parseAsync(await C.arrayBuffer(),"");if(a){I_(F.scene);return}let Z=F.scene;if(Z.name=D.id,Z.scale.setScalar(D.scale),Z.rotation.set(gn.degToRad(D.pitch||0),gn.degToRad(D.yaw||0),gn.degToRad(D.roll||0)),c.add(Z),g.set(D.id,Z),m.set(D.id,{time:0,x:D.x,y:D.y,z:D.z,yaw:D.yaw||0}),F.animations.length&&D.animation!=="__none__"){let G=new Sa(Z),ie=F.animations.find((X)=>X.name===D.animation)||F.animations[0];G.clipAction(ie).play(),S.push(G),p.push(...F.animations)}i.onAnimations?.(D.id,F.animations.map((G)=>G.name)),T(o)}));E.ready=M,M.catch((D)=>{if(!a)i.onError?.(String(D))});let H=()=>{if(a)return;a=!0;try{for(let D of S)D.stopAllAction(),D.uncacheRoot(D.getRoot());I_(c)}finally{h.dispose(),h.forceContextLoss(),h.domElement.remove(),c.clear(),g.clear(),m.clear(),S.length=0,p.length=0}},O=new ba,z=new pn(new U(0,1,0),0);return{...E,dispose:H,time:()=>o,pick:(D,C)=>{O.setFromCamera(new Ue(D*2-1,1-C*2),d);let F=O.intersectObjects([...g.values()],!0)[0];if(!F)return null;let Z=F.object;while(Z&&g.get(Z.name)!==Z)Z=Z.parent;return Z?{id:Z.name,x:Z.position.x,y:Z.position.y,z:Z.position.z,yaw:gn.radToDeg(Z.rotation.y)}:null},ground:(D,C)=>{O.setFromCamera(new Ue(D*2-1,1-C*2),d);let F=O.ray.intersectPlane(z,new U);return F?{x:F.x,z:F.z}:null},moveObject:(D,C,F)=>{if(a)return;let Z=g.get(D);if(!Z)return;Z.position.x=C,Z.position.z=F,h.render(c,d)}}}function L_(e,t,n,i="color"){let r=e.time(),s=e.scene.overrideMaterial,o=e.scene.background,a=e.camera.far,c=[],l;try{if(e.update(n),i!=="color"){if(e.scene.traverse((u)=>{if((u instanceof An||u instanceof Ai)&&u.visible)c.push(u),u.visible=!1}),e.camera.far=Math.max(e.camera.near+1,t.camera.distance*2+10),e.camera.updateProjectionMatrix(),l=i==="whitebox"?new Gn({color:"#ffffff",roughness:1,metalness:0}):new Fs({depthPacking:Il}),i==="depth")l.onBeforeCompile=(u)=>{u.uniforms.studioDepthNear={value:e.camera.near},u.uniforms.studioDepthFar={value:e.camera.far},u.fragmentShader=`uniform float studioDepthNear;uniform float studioDepthFar;
${u.fragmentShader.replace("1.0 - fragCoordZ","clamp(1.0-(-perspectiveDepthToViewZ(fragCoordZ,studioDepthNear,studioDepthFar)-studioDepthNear)/(studioDepthFar-studioDepthNear),0.0,1.0)")}`},l.customProgramCacheKey=()=>"studio-linear-camera-depth";e.scene.overrideMaterial=l,e.scene.background=new Re(i==="whitebox"?"#888888":"#000000"),e.renderer.render(e.scene,e.camera)}return e.renderer.domElement.toDataURL("image/png")}finally{c.forEach((u)=>{u.visible=!0}),e.camera.far=a,e.camera.updateProjectionMatrix(),e.scene.overrideMaterial=s,e.scene.background=o,l?.dispose(),e.update(r)}}var hn=window;try{if(hn.studioGraphicsInput){let e=hn.studioGraphicsInput,t=pi(bp).max(50).parse(e.items),n=document.createElement("canvas");n.width=e.width,n.height=e.height,document.body.appendChild(n),hn.studioPrevisCapture=async(i)=>{let r=n.getContext("2d");if(!r)throw Error("Graphic canvas is unavailable");let s=new Image,o=Sp(t,i,e.width,e.height,e.images);return s.src=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(o)))}`,await s.decode(),r.clearRect(0,0,e.width,e.height),r.drawImage(s,0,0),n.toDataURL("image/png")},hn.studioPrevisReady=!0}else{let e=Mp.parse(hn.studioPrevisInput.scene),t=P_(document.body,e,async(n)=>{let i=hn.studioPrevisInput.models[n];if(!i)throw Error("Stored 3D model is unavailable");let r=Uint8Array.from(atob(i),(s)=>s.charCodeAt(0));return new Blob([r],{type:"model/gltf-binary"})},{width:Ve().int().min(64).max(4096).parse(hn.studioPrevisInput.width||640),height:Ve().int().min(64).max(4096).parse(hn.studioPrevisInput.height||360),onError:(n)=>{hn.studioPrevisError=n}});hn.studioPrevisCapture=(n,i)=>L_(t,e,n,i),t.ready.then(()=>{hn.studioPrevisReady=!0}).catch((n)=>{hn.studioPrevisError=String(n)})}}catch(e){hn.studioPrevisError=String(e)}})();
