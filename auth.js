// Mediator Dei — accounts and cross-device sync (Supabase).
// Everything the prayer book saves in localStorage (keys starting with the prefixes below)
// is mirrored to one row per user in `prayer_book_state`. Signed out, the app works exactly as before.
(function(){
'use strict';
const SUPABASE_URL='https://prwboqyigjqdwpolcpit.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByd2JvcXlpZ2pxZHdwb2xjcGl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4ODE0NDgsImV4cCI6MjEwODQ1NzQ0OH0.NA03Yppo_r0d0_kIiPpAKALw6OQLthdMVH9-koxvc_Y'; // anon public key: safe in the browser, access is limited by row-level security
const TABLE='prayer_book_state';
const SYNC_PREFIXES=['oratorium-','mediator-dei-','md-'];
const SYNC_META='luca-sync-at'; // when this device last matched the server; never synced itself

const $=id=>document.getElementById(id);
function createEl(tag,cls,txt){let n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
const isSynced=k=>SYNC_PREFIXES.some(p=>k.startsWith(p));
function snapshot(){const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&isSynced(k))o[k]=localStorage.getItem(k)}return o}
function sameData(a,b){const ka=Object.keys(a),kb=Object.keys(b||{});return ka.length===kb.length&&ka.every(k=>b[k]===a[k])}

let client=null,user=null,pushTimer=null,applying=false,status='';
try{if(window.supabase&&SUPABASE_ANON_KEY)client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY)}catch(e){console.warn(e)}

// Watch the app's own saves so they are pushed without touching the prayer book code.
const proto=Storage.prototype,origSet=proto.setItem,origRemove=proto.removeItem;
proto.setItem=function(k,v){origSet.call(this,k,v);if(this===localStorage&&!applying&&isSynced(String(k)))schedulePush()};
proto.removeItem=function(k){origRemove.call(this,k);if(this===localStorage&&!applying&&isSynced(String(k)))schedulePush()};
function quiet(fn){applying=true;try{fn()}finally{applying=false}}

function setStatus(s){status=s;renderButton();if(modalView==='account')renderModal()}
function schedulePush(){if(!user)return;clearTimeout(pushTimer);pushTimer=setTimeout(push,1500);setStatus('Saving…')}
async function push(){
 clearTimeout(pushTimer);pushTimer=null;if(!user)return;
 const at=new Date().toISOString();
 const {error}=await client.from(TABLE).upsert({user_id:user.id,data:snapshot(),updated_at:at});
 if(error){setStatus('Not synced — '+error.message);return}
 quiet(()=>origSet.call(localStorage,SYNC_META,at));setStatus('Synced')
}
// Returns true when server data changed this device, so the page must reload to show it.
async function pull(){
 setStatus('Syncing…');
 const {data,error}=await client.from(TABLE).select('data,updated_at').eq('user_id',user.id).maybeSingle();
 if(error){setStatus('Not synced — '+error.message);return false}
 const local=snapshot();
 if(!data){await push();return false}
 const last=localStorage.getItem(SYNC_META);
 if(last&&new Date(data.updated_at)<=new Date(last)){if(!sameData(local,data.data))await push();else setStatus('Synced');return false}
 const merged=Object.assign({},local,data.data||{});let changed=false;
 quiet(()=>{for(const [k,v] of Object.entries(merged)){if(local[k]!==v){localStorage.setItem(k,v);changed=true}}origSet.call(localStorage,SYNC_META,data.updated_at)});
 if(!sameData(merged,data.data))await push();else setStatus('Synced');
 return changed
}
async function afterSignIn(u){user=u;closeModal();renderButton();if(await pull())location.reload()}
async function signOut(){
 if(pushTimer)await push();
 await client.auth.signOut();
 // Keep one person's intentions and progress from showing to the next person on this device.
 quiet(()=>{Object.keys(snapshot()).forEach(k=>localStorage.removeItem(k));localStorage.removeItem(SYNC_META)});
 location.reload()
}

// ── Interface ──
function renderButton(){
 const b=$('accountBtn');if(!b)return;
 b.textContent=user?'✠  '+(user.email||'Account').split('@')[0]:'Sign in';
 b.title=user?(user.email+(status?' · '+status:'')):'Sign in to sync your prayers across devices';
}
let modalView='signin',modalMsg='',modalErr=false;
const overlay=createEl('div','auth-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','authTitle');
const card=createEl('div','auth-card');overlay.append(card);
overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))closeModal()});
function openModal(view){modalView=view;modalMsg='';modalErr=false;renderModal();overlay.classList.add('open');const f=card.querySelector('input');if(f)f.focus()}
function closeModal(){overlay.classList.remove('open')}
function message(text,err){modalMsg=text;modalErr=!!err;let m=card.querySelector('.auth-msg');if(m){m.textContent=text;m.classList.toggle('error',!!err)}}
function field(label,type,name,auto){const l=createEl('label','auth-field');l.append(createEl('span',null,label));const i=createEl('input');i.type=type;i.name=name;i.required=true;i.autocomplete=auto;if(type==='password')i.minLength=6;l.append(i);return l}
function linkBtn(text,view){const b=createEl('button','auth-link',text);b.type='button';b.addEventListener('click',()=>openModal(view));return b}
function renderModal(){
 card.replaceChildren();
 const close=createEl('button','auth-close','×');close.type='button';close.setAttribute('aria-label','Close');close.addEventListener('click',closeModal);card.append(close);
 const titles={signin:['INTROITUS','Sign in'],signup:['NOVUS LIBER','Create an account'],reset:['CLAVIS AMISSA','Reset password'],newpass:['CLAVIS NOVA','Choose a new password'],account:['LIBER TUUS','Your account']};
 const [kicker,title]=titles[modalView];
 card.append(createEl('div','auth-kicker','✠  '+kicker),createEl('h3',null,title));card.lastChild.id='authTitle';
 if(!client){card.append(createEl('p','auth-sub','Accounts are not available right now. Your prayers are still saved on this device.'));return}
 if(modalView==='account'){
  card.append(createEl('p','auth-sub','Signed in as '+user.email+'. Your Rosary progress, prayer rule, intentions, novenas and saved saints follow you to every device where you sign in.'));
  card.append(createEl('p','auth-status',status||'Synced'));
  const row=createEl('div','auth-actions');
  const sync=createEl('button','hero-secondary','↻  Sync now');sync.type='button';sync.addEventListener('click',async()=>{if(await pull())location.reload()});
  const out=createEl('button','hero-cta','Sign out');out.type='button';out.addEventListener('click',()=>{out.disabled=true;signOut()});
  row.append(sync,out);card.append(row);
  card.append(createEl('p','auth-note','Signing out removes your saved prayers from this device; they stay safe in your account.'));
  return
 }
 const subs={signin:'Sync your daily rule and Rosary across your phone and computer.',signup:'Free. Your prayers stay private to you.',reset:'We will email you a link to choose a new password.',newpass:'Enter a new password for your account.'};
 card.append(createEl('p','auth-sub',subs[modalView]));
 const form=createEl('form','auth-form');form.noValidate=false;
 if(modalView!=='newpass')form.append(field('Email','email','email','email'));
 if(modalView!=='reset')form.append(field(modalView==='newpass'?'New password':'Password','password','password',modalView==='signin'?'current-password':'new-password'));
 const submit=createEl('button','hero-cta',{signin:'✠  Sign in',signup:'✠  Create account',reset:'Send reset link',newpass:'Save password'}[modalView]);submit.type='submit';
 form.append(submit,createEl('p','auth-msg'+(modalErr?' error':''),modalMsg));
 form.addEventListener('submit',async e=>{
  e.preventDefault();const email=form.email&&form.email.value.trim(),password=form.password&&form.password.value;
  submit.disabled=true;message('One moment…');
  const back=location.origin+location.pathname;let res;
  try{
   if(modalView==='signin'){res=await client.auth.signInWithPassword({email,password});if(!res.error)return afterSignIn(res.data.user)}
   else if(modalView==='signup'){res=await client.auth.signUp({email,password,options:{emailRedirectTo:back}});if(!res.error){if(res.data.session)return afterSignIn(res.data.user);message('Check your email to confirm your account, then sign in.')}}
   else if(modalView==='reset'){res=await client.auth.resetPasswordForEmail(email,{redirectTo:back});if(!res.error)message('If that email has an account, a reset link is on its way.')}
   else{res=await client.auth.updateUser({password});if(!res.error)return afterSignIn(res.data.user)}
   if(res.error)message(res.error.message,true)
  }catch(err){message('Could not reach the server. Check your connection.',true)}
  submit.disabled=false
 });
 card.append(form);
 const links=createEl('div','auth-links');
 if(modalView==='signin')links.append(linkBtn('Create an account','signup'),linkBtn('Forgot password?','reset'));
 else if(modalView!=='newpass')links.append(linkBtn('Back to sign in','signin'));
 card.append(links);
}

function init(){
 document.body.append(overlay);
 const b=$('accountBtn');if(b)b.addEventListener('click',()=>openModal(user?'account':'signin'));
 renderButton();
 if(!client)return;
 client.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){user=session&&session.user;openModal('newpass')}
  if(event==='SIGNED_OUT'){user=null;renderButton()}
 });
 client.auth.getSession().then(async({data})=>{
  if(!data.session)return;user=data.session.user;renderButton();
  if(await pull())location.reload();
 });
 // Flush a pending save when the tab is hidden or closed.
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&pushTimer)push()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
