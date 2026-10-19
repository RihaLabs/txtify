import {Parser,NameRegistry} from 'pickleparser';
const NP={f8:'float64',f4:'float32',f2:'float16',i8:'int64',i4:'int32',i2:'int16',i1:'int8',u8:'uint64',u4:'uint32',u2:'uint16',u1:'uint8',b1:'bool',O:'object',M8:'datetime64',m8:'timedelta64'};
const kd=d=>{const k=typeof d==='string'?d:d&&d.dt;return typeof k==='string'?k.replace(/^[<>=|]/,''):''};
const dn=d=>{const k=kd(d);return NP[k]||(k[0]==='O'?'object':k[0]==='U'?'str':k[0]==='S'?'bytes':k||'object')};
const reg=new NameRegistry(),put=(m,n,f)=>m.forEach(x=>reg.register(x,n,f)),MA=['numpy.core.multiarray','numpy._core.multiarray'],NU=['numpy.core.numeric','numpy._core.numeric'];
put(['numpy'],'dtype',function(...a){return{dt:a[0],__setstate__(){}}});
put(MA,'_reconstruct',function(){return{__np:1,__setstate__(s){this.shape=s[1];this.dtype=s[2];this.raw=s[4]}}});
put(NU,'_frombuffer',function(b,d,s){return{__np:1,raw:b,dtype:d,shape:s}});
put(MA,'scalar',function(d,b){return{__sc:1,dtype:d,raw:b}});
put(['pyarrow.lib'],'type_for_alias',a=>({alias:a}));
put(['pyarrow.lib'],'py_buffer',b=>b);
put(['builtins','__builtin__'],'bytearray',a=>a instanceof Uint8Array?a:Array.isArray(a)?Uint8Array.from(a[0],c=>c.charCodeAt(0)):new Uint8Array(0));
put(['_codecs'],'encode',s=>Uint8Array.from(s,c=>c.charCodeAt(0)));
put(['pyarrow.lib'],'_restore_array',function(t){return{__arrow:1,type:t[0],len:t[1],bufs:t[4]}});
const dts=s=>{if(s==='-9223372036854775808')return'NaT';let v=Number(s);const a=Math.abs(v);v=a>1e17?v/1e6:a>1e14?v/1e3:a>1e11?v:v*1e3;return new Date(v).toISOString().replace('T',' ').replace(/(\.000)?Z$/,'')};
const cp=u=>Uint8Array.prototype.slice.call(u);
function flat(a){const k=kd(a.dtype),r=a.raw;if(Array.isArray(r))return r;if(!(r instanceof Uint8Array))return null;
 const b=cp(r),W=b.length,T={f8:Float64Array,f4:Float32Array,i4:Int32Array,i2:Int16Array,i1:Int8Array,u4:Uint32Array,u2:Uint16Array,u1:Uint8Array,b1:Uint8Array}[k];
 if(T){const v=Array.from(new T(b.buffer,0,W/T.BYTES_PER_ELEMENT|0));return k==='b1'?v.map(Boolean):v}
 if(/^(i8|u8|M8|m8)$/.test(k)){const v=Array.from(new BigInt64Array(b.buffer,0,W>>3),String);return k==='M8'?v.map(dts):v}
 return null}
function astr(a){const[v,off,dat]=a.bufs,n=a.len;if(!off||!dat)return null;const big=String(a.type&&a.type.alias).startsWith('large'),o=cp(off),O=big?new BigInt64Array(o.buffer,0,n+1):new Int32Array(o.buffer,0,n+1),td=new TextDecoder(),r=[];
 for(let i=0;i<n;i++)r.push(v&&!(v[i>>3]>>(i&7)&1)?null:td.decode(dat.subarray(Number(O[i]),Number(O[i+1]))));return r}
function vinfo(v){
 if(v&&v.__np)return{dtype:dn(v.dtype),shape:v.shape,data:flat(v)};
 if(v&&v._pa_array&&v._pa_array.__arrow){const d=astr(v._pa_array);return{dtype:'string',shape:[d?d.length:0],data:d}}
 if(v&&v[1]&&v[1].__np)return{dtype:dn(v[0]),shape:v[1].shape,data:flat(v[1])};
 return{dtype:v&&v.__name__||'object',shape:null,data:null}}
function ixinfo(ix){const d=ix&&ix.args&&ix.args[1];if(!d)return null;
 if(d.start!=null){const n=Math.max(0,Math.ceil((d.stop-d.start)/(d.step||1)));return{n,get:()=>Array.from({length:n},(_,i)=>d.start+i*(d.step||1))}}
 const dv=d.data,l=dv&&(dv.__np?flat(dv):dv._pa_array&&dv._pa_array.__arrow?astr(dv._pa_array):null);return l?{n:l.length,get:()=>l}:null}
function frame(x){const m=x._mgr||x._data;if(!m)return null;let axes,bl;
 if(m.args&&Array.isArray(m.args[0])&&Array.isArray(m.args[1])&&m.args[0][0]&&m.args[0][0].args){axes=m.args[1];bl=m.args[0].map(b=>({v:b.args[0],p:b.args[1]}))}
 else if(m[0]&&m[1]&&m[2]){axes=m[0];bl=m[1].map((v,i)=>({v,it:m[2][i]}))}else return null;
 const ser=x.__name__==='Series',ci=ser?null:ixinfo(axes[0]),ri=ixinfo(axes[ser?0:1]),L=ser?[x._name??x.name??'']:ci?ci.get():[],cols=[];let nr=ri?ri.n:null;
 for(const b of bl){const v=vinfo(b.v);let pos;
  if(b.p){const a=b.p.args;pos=a&&typeof a[0]==='number'?Array.from({length:Math.max(0,Math.ceil((a[1]-a[0])/(a[2]||1)))},(_,i)=>a[0]+i*(a[2]||1)):b.p.__np?(flat(b.p)||[]).map(Number):[]}
  else{const il=ixinfo(b.it),t=il?il.get():[];pos=ser?[0]:t.map(n=>L.indexOf(n))}
  if(nr==null&&v.shape)nr=v.shape[v.shape.length-1];
  pos.forEach((p,j)=>cols[p]={name:L[p],dtype:v.dtype,data:v.data&&(v.shape&&v.shape.length===2?v.data.slice(j*nr,(j+1)*nr):v.data)})}
 return{cols,rows:nr,ser}}
const q=v=>{if(v==null)return'';v=String(v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const fs=f=>f.ser?'pandas Series\nlength: '+f.rows+'\ndtype: '+f.cols[0].dtype+(f.cols[0].name!==''?'\nname: '+f.cols[0].name:''):'pandas DataFrame\nrows: '+f.rows+'\ncolumns: '+f.cols.length+'\n'+f.cols.map((c,i)=>(i+1)+'. '+q(c.name)+' : '+c.dtype).join('\n');
const ft=f=>fs(f)+'\n'+f.cols.map(c=>q(c.name)).join(',')+'\n'+Array.from({length:f.rows||0},(_,i)=>f.cols.map(c=>q(c.data?c.data[i]:'?')).join(',')).join('\n');
const tn=x=>x==null?'None':Array.isArray(x)?'list':x instanceof Uint8Array?'bytes':typeof x==='number'?(Number.isInteger(x)?'int':'float'):typeof x==='string'?'str':typeof x==='boolean'?'bool':typeof x==='bigint'?'int':'object';
const uq=a=>[...new Set(a)].join(' | ');
function S(x,d){
 if(x&&typeof x==='object'&&!Array.isArray(x)&&!(x instanceof Uint8Array)){
  if(x.__np)return'ndarray dtype='+dn(x.dtype)+' shape=('+(x.shape||[]).join(', ')+')';
  if(x.__sc)return'numpy '+dn(x.dtype);
  if(x.__name__==='DataFrame'||x.__name__==='Series'){const f=frame(x);if(f)return d?fs(f).replace(/\n/g,'\n  '):fs(f)}
  if(x.__name__)return x.__module__+'.'+x.__name__;
  const v=Object.values(x);return d>3?'dict':'dict['+v.length+'] { keys: str, values: '+(uq(v.slice(0,20).map(y=>S(y,d+1)))||'empty')+' }'}
 if(Array.isArray(x))return d>3?'list':'list['+x.length+'] of '+(uq(x.slice(0,20).map(y=>S(y,d+1)))||'empty');
 return x instanceof Uint8Array?'bytes['+x.length+']':tn(x)}
function V(x,d){
 if(x==null)return'None';
 if(typeof x==='string')return JSON.stringify(x.length>300?x.slice(0,300)+'...':x);
 if(typeof x!=='object')return String(x);
 if(x instanceof Uint8Array)return'bytes['+x.length+']';
 if(x.__np){const f=flat(x);return'ndarray '+dn(x.dtype)+' ('+(x.shape||[]).join(', ')+')'+(f?' '+JSON.stringify(f.slice(0,100).map(String))+(f.length>100?' ... '+f.length+' values':''):'')}
 if(x.__sc)return'numpy '+dn(x.dtype)+' '+((flat(x)||['?'])[0]);
 if(x.__name__==='DataFrame'||x.__name__==='Series'){const f=frame(x);if(f)return ft(f)}
 if(d>8)return'...';
 const ind='  '.repeat(d+1);
 if(Array.isArray(x))return x.length?'[\n'+x.slice(0,100).map(y=>ind+V(y,d+1)).join(',\n')+(x.length>100?',\n'+ind+'... '+x.length+' items':'')+'\n'+'  '.repeat(d)+']':'[]';
 const e=Object.entries(x),nm=x.__name__?x.__module__+'.'+x.__name__+(x.args&&x.args.length?'('+x.args.map(y=>V(y,d+1)).join(', ')+')':''):'';
 return nm+(e.length?'{\n'+e.slice(0,100).map(([k,y])=>ind+k+': '+V(y,d+1)).join(',\n')+(e.length>100?',\n'+ind+'... '+e.length+' keys':'')+'\n'+'  '.repeat(d)+'}':nm?'':'{}')}
export function pickleText(u8,so){const o=new Parser({nameResolver:reg}).parse(u8);return so?S(o,0):V(o,0)}
