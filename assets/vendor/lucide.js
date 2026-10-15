(()=>{/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var p={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ve=([e,a,t])=>{let r=document.createElementNS("http://www.w3.org/2000/svg",e);return Object.keys(a).forEach(o=>{r.setAttribute(o,String(a[o]))}),t?.length&&t.forEach(o=>{let u=ve(o);r.appendChild(u)}),r},d=(e,a={})=>{let r={...p,...a};return ve(["svg",r,e])};/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Re=(...e)=>e.filter((a,t,r)=>!!a&&a.trim()!==""&&r.indexOf(a)===t).join(" ").trim();/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Te=e=>{for(let a in e)if(a.startsWith("aria-")||a==="role"||a==="title")return!0;return!1};/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var qe=e=>{let a="",t=!1;for(let r of e){if(r==="-"||r==="_"||r<=" "){t=a.length>0;continue}a.length===0?a+=r.toLowerCase():a+=t?r.toUpperCase():r,t=!1}return a};/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var be=e=>{let a=qe(e);return a.charAt(0).toUpperCase()+a.slice(1)};/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var We=e=>Array.from(e.attributes).reduce((a,t)=>(a[t.name]=t.value,a),{}),He=e=>typeof e=="string"?e:!e||!e.class?"":e.class&&typeof e.class=="string"?e.class.split(" "):e.class&&Array.isArray(e.class)?e.class:"",C=(e,{nameAttr:a,icons:t,attrs:r})=>{let o=e.getAttribute(a);if(o==null)return;let u=be(o),f=t[u];if(!f)return console.warn(`${e.outerHTML} icon name was not found in the provided icons object.`);let l=We(e),Oe=Te(l)?{}:{"aria-hidden":"true"},Le={...p,"data-lucide":o,...Oe,...r,...l},Ve=He(l),Ee=He(r),De=Re("lucide",`lucide-${o}`,...Ve,...Ee);De&&Object.assign(Le,{class:De});let Ge=d(f,Le);return e.parentNode?.replaceChild(Ge,e)};/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var S=[["path",{d:"M5 12h14"}],["path",{d:"m12 5 7 7-7 7"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var g=[["path",{d:"M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"}],["path",{d:"M8 10h8"}],["path",{d:"M8 18h8"}],["path",{d:"M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6"}],["path",{d:"M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var M=[["path",{d:"M10 4 8 6"}],["path",{d:"M17 19v2"}],["path",{d:"M2 12h20"}],["path",{d:"M7 19v2"}],["path",{d:"M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var k=[["path",{d:"M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"}],["path",{d:"M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"}],["path",{d:"M12 4v6"}],["path",{d:"M2 18h20"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var w=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var P=[["path",{d:"M10 12h4"}],["path",{d:"M10 8h4"}],["path",{d:"M14 21v-3a2 2 0 0 0-4 0v3"}],["path",{d:"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"}],["path",{d:"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var A=[["path",{d:"M8 6v6"}],["path",{d:"M15 6v6"}],["path",{d:"M2 12h19.6"}],["path",{d:"M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"}],["circle",{cx:"7",cy:"18",r:"2"}],["path",{d:"M9 18h5"}],["circle",{cx:"16",cy:"18",r:"2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var y=[["path",{d:"M8 2v3"}],["path",{d:"M16 2v3"}],["rect",{x:"3",y:"3",width:"18",height:"18",rx:"2"}],["path",{d:"M3 9h18"}],["path",{d:"m9 15 2 2 4-4"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var B=[["path",{d:"M16 18h6"}],["path",{d:"M16 2v3"}],["path",{d:"M19 15v6"}],["path",{d:"M21 11.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8.3"}],["path",{d:"M3 9h18"}],["path",{d:"M8 2v3"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var F=[["path",{d:"M8 2v3"}],["path",{d:"M16 2v3"}],["rect",{x:"3",y:"3",width:"18",height:"18",rx:"2"}],["path",{d:"M3 9h18"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var L=[["path",{d:"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"}],["circle",{cx:"12",cy:"13",r:"3"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var D=[["path",{d:"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"}],["circle",{cx:"7",cy:"17",r:"2"}],["path",{d:"M9 17h6"}],["circle",{cx:"17",cy:"17",r:"2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var v=[["path",{d:"M20 6 9 17l-5-5"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var R=[["path",{d:"m9 18 6-6-6-6"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var m=[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"m16 9-5.5 5.5L8 12"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var T=[["circle",{cx:"12",cy:"12",r:"10"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var q=[["rect",{width:"8",height:"4",x:"8",y:"2",rx:"1",ry:"1"}],["path",{d:"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"}],["path",{d:"m9 14 2 2 4-4"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var b=[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M12 6v6h4"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var H=[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M12 6v6l4 2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var U=[["path",{d:"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"}],["path",{d:"M16 14v6"}],["path",{d:"M8 14v6"}],["path",{d:"M12 16v6"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var O=[["path",{d:"M12 2v2"}],["path",{d:"m4.93 4.93 1.41 1.41"}],["path",{d:"M20 12h2"}],["path",{d:"m19.07 4.93-1.41 1.41"}],["path",{d:"M15.947 12.65a4 4 0 0 0-5.925-4.128"}],["path",{d:"M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var V=[["path",{d:"M10 2v2"}],["path",{d:"M14 2v2"}],["path",{d:"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"}],["path",{d:"M6 2v2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var E=[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var G=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var W=[["circle",{cx:"12",cy:"12",r:"10"}],["line",{x1:"22",x2:"18",y1:"12",y2:"12"}],["line",{x1:"6",x2:"2",y1:"12",y2:"12"}],["line",{x1:"12",x2:"12",y1:"6",y2:"2"}],["line",{x1:"12",x2:"12",y1:"22",y2:"18"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var I=[["path",{d:"M12 15V3"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["path",{d:"m7 10 5 5 5-5"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var z=[["path",{d:"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"}],["path",{d:"m2.5 21.5 1.4-1.4"}],["path",{d:"m20.1 3.9 1.4-1.4"}],["path",{d:"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"}],["path",{d:"m9.6 14.4 4.8-4.8"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var X=[["path",{d:"M15 3h6v6"}],["path",{d:"M10 14 21 3"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var N=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Z=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var K=[["circle",{cx:"12",cy:"12",r:"3"}],["path",{d:"M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"}],["path",{d:"M12 7.5V9"}],["path",{d:"M7.5 12H9"}],["path",{d:"M16.5 12H15"}],["path",{d:"M12 16.5V15"}],["path",{d:"m8 8 1.88 1.88"}],["path",{d:"M14.12 9.88 16 8"}],["path",{d:"m8 16 1.88-1.88"}],["path",{d:"M14.12 14.12 16 16"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Q=[["path",{d:"M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"}],["path",{d:"M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"}],["path",{d:"M16 17h4"}],["path",{d:"M4 13h4"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var J=[["path",{d:"m15 17 5-5-5-5"}],["path",{d:"M4 18v-2a4 4 0 0 1 4-4h12"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var j=[["path",{d:"m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"}],["path",{d:"m18 15 4-4"}],["path",{d:"m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Y=[["path",{d:"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"}],["path",{d:"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var $=[["path",{d:"M10 22v-6.57"}],["path",{d:"M12 11h.01"}],["path",{d:"M12 7h.01"}],["path",{d:"M14 15.43V22"}],["path",{d:"M15 16a5 5 0 0 0-6 0"}],["path",{d:"M16 11h.01"}],["path",{d:"M16 7h.01"}],["path",{d:"M8 11h.01"}],["path",{d:"M8 7h.01"}],["rect",{x:"4",y:"2",width:"16",height:"20",rx:"2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var _=[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M12 16v-4"}],["path",{d:"M12 8h.01"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ee=[["path",{d:"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ae=[["path",{d:"M10 18v-7"}],["path",{d:"M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"}],["path",{d:"M14 18v-7"}],["path",{d:"M18 18v-7"}],["path",{d:"M3 22h18"}],["path",{d:"M6 18v-7"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var re=[["line",{x1:"2",x2:"5",y1:"12",y2:"12"}],["line",{x1:"19",x2:"22",y1:"12",y2:"12"}],["line",{x1:"12",x2:"12",y1:"2",y2:"5"}],["line",{x1:"12",x2:"12",y1:"19",y2:"22"}],["circle",{cx:"12",cy:"12",r:"7"}],["circle",{cx:"12",cy:"12",r:"3"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var te=[["path",{d:"M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2"}],["path",{d:"M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14"}],["path",{d:"M10 20h4"}],["circle",{cx:"16",cy:"20",r:"2"}],["circle",{cx:"8",cy:"20",r:"2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var oe=[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{cx:"12",cy:"10",r:"3"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var fe=[["path",{d:"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"}],["path",{d:"M15 5.764v15"}],["path",{d:"M9 3.236v15"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var le=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var se=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var de=[["polygon",{points:"12 2 19 21 12 17 5 21 12 2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ue=[["polygon",{points:"3 11 22 2 13 21 11 13 3 11"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var pe=[["path",{d:"M2 22h20"}],["path",{d:"M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var me=[["path",{d:"M2 22h20"}],["path",{d:"M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var xe=[["path",{d:"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ie=[["path",{d:"M16.247 7.761a6 6 0 0 1 0 8.478"}],["path",{d:"M19.075 4.933a10 10 0 0 1 0 14.134"}],["path",{d:"M4.925 19.067a10 10 0 0 1 0-14.134"}],["path",{d:"M7.753 16.239a6 6 0 0 1 0-8.478"}],["circle",{cx:"12",cy:"12",r:"2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ne=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"}],["path",{d:"M21 3v5h-5"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"}],["path",{d:"M8 16H3v5"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ce=[["circle",{cx:"6",cy:"19",r:"3"}],["path",{d:"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"}],["circle",{cx:"18",cy:"5",r:"3"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var he=[["path",{d:"m21 21-4.34-4.34"}],["circle",{cx:"11",cy:"11",r:"8"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Ce=[["path",{d:"M12 2v2"}],["path",{d:"M12 9.189V13"}],["path",{d:"M19 12V6a2 2 0 00-2-2H7a2 2 0 00-2 2v6"}],["path",{d:"M19.38 19A11.6 11.6 0 0021 13l-8.188-3.639a2 2 0 00-1.624 0L3 13.001a11.6 11.6 0 002.81 7.76"}],["path",{d:"M2 20c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Se=[["path",{d:"M16 10a4 4 0 0 1-8 0"}],["path",{d:"M3.103 6.034h17.794"}],["path",{d:"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var x=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{d:"M20 2v4"}],["path",{d:"M22 4h-4"}],["circle",{cx:"4",cy:"20",r:"2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var i=[["path",{d:"M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344"}],["path",{d:"m9 11 3 3L22 4"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ge=[["path",{d:"M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"}],["path",{d:"M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"}],["path",{d:"M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Me=[["path",{d:"M15 4H7"}],["path",{d:"m18 16 3 3-3 3"}],["path",{d:"M3 4v13a2 2 0 0 0 2 2h16"}],["path",{d:"M7 14h7"}],["path",{d:"M7 9h12"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ke=[["circle",{cx:"12",cy:"12",r:"4"}],["path",{d:"M12 2v2"}],["path",{d:"M12 20v2"}],["path",{d:"m4.93 4.93 1.41 1.41"}],["path",{d:"m17.66 17.66 1.41 1.41"}],["path",{d:"M2 12h2"}],["path",{d:"M20 12h2"}],["path",{d:"m6.34 17.66-1.41 1.41"}],["path",{d:"m19.07 4.93-1.41 1.41"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var we=[["circle",{cx:"12",cy:"12",r:"10"}],["circle",{cx:"12",cy:"12",r:"6"}],["circle",{cx:"12",cy:"12",r:"2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Pe=[["path",{d:"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"}],["path",{d:"M13 5v2"}],["path",{d:"M13 17v2"}],["path",{d:"M13 11v2"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var n=[["rect",{width:"16",height:"16",x:"4",y:"3",rx:"2"}],["path",{d:"M4 11h16"}],["path",{d:"M12 3v8"}],["path",{d:"m8 19-2 3"}],["path",{d:"m18 22-2-3"}],["path",{d:"M8 15h.01"}],["path",{d:"M16 15h.01"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var s=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{d:"M12 9v4"}],["path",{d:"M12 17h.01"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Ae=[["path",{d:"M12 3v12"}],["path",{d:"m17 8-5-5-5 5"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var c=[["path",{d:"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"}],["path",{d:"M7 2v20"}],["path",{d:"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var h=[["path",{d:"M2 12q2.5 2 5 0t5 0 5 0 5 0"}],["path",{d:"M2 19q2.5 2 5 0t5 0 5 0 5 0"}],["path",{d:"M2 5q2.5 2 5 0t5 0 5 0 5 0"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ye=[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Be=[["path",{d:"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"}]];/**
 * @license lucide v1.43.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Fe=({icons:e={},nameAttr:a="data-lucide",attrs:t={},root:r=document,inTemplates:o}={})=>{if(!Object.values(e).length)throw new Error(`Please provide an icons object.
If you want to use all the icons you can import it like:
 \`import { createIcons, icons } from 'lucide';
lucide.createIcons({icons});\``);if(typeof r>"u")throw new Error("`createIcons()` only works in a browser environment.");if(Array.from(r.querySelectorAll(`[${a}]`)).forEach(f=>C(f,{nameAttr:a,icons:e,attrs:t})),o&&Array.from(r.querySelectorAll("template")).forEach(l=>Fe({icons:e,nameAttr:a,attrs:t,root:l.content,inTemplates:o})),a==="data-lucide"){let f=r.querySelectorAll("[icon-name]");f.length>0&&(console.warn("[Lucide] Some icons were found with the now deprecated icon-name attribute. These will still be replaced for backwards compatibility, but will no longer be supported in v1.0 and you should switch to data-lucide"),Array.from(f).forEach(l=>C(l,{nameAttr:"icon-name",icons:e,attrs:t})))}};var Ue={AlertTriangle:s,ArrowRight:S,Backpack:g,Bath:M,BedDouble:k,Briefcase:w,Building2:P,Bus:A,Calendar:F,CalendarCheck:y,CalendarPlus:B,Camera:L,Car:D,Check:v,CheckCircle2:m,CheckSquare:i,ChevronRight:R,Circle:T,ClipboardCheck:q,Clock:H,Clock3:b,CloudRain:U,CloudSun:O,Coffee:V,Compass:E,Copy:G,Crosshair:W,Download:I,Dumbbell:z,ExternalLink:X,Eye:N,File:Z,Flower:K,Footprints:Q,Forward:J,Hammer:j,HeartPulse:Y,Hotel:$,Info:_,KeyRound:ee,Landmark:ae,LocateFixed:re,Luggage:te,Map:fe,MapPin:oe,Monitor:le,Moon:se,Navigation:ue,Navigation2:de,Plane:xe,PlaneLanding:pe,PlaneTakeoff:me,Radio:ie,RefreshCw:ne,Route:ce,Search:he,Ship:Ce,ShoppingBag:Se,Sparkles:x,Store:ge,Summary:Me,Sun:ke,Target:we,Ticket:Pe,Train:n,TriangleAlert:s,Upload:Ae,Utensils:c,Waves:h,X:ye,Zap:Be};window.lucide={icons:Ue,createElement:d,createIcons(e={}){return Fe({icons:Ue,...e})}};})();
