(()=>{'use strict';
const $=id=>document.getElementById(id),S=window.NanoBridge;
const URLBASE=String(window.NANO_SUPABASE_URL||'').trim().replace(/\/$/,''),KEY=String(window.NANO_SUPABASE_KEY||'').trim();
const ready=URLBASE.startsWith('https://')&&URLBASE.includes('.supabase.co')&&(KEY.startsWith('sb_publishable_')||KEY.startsWith('eyJ'));
let session=null,profile=null,busy=false;
const sessionKey='nano4you_session_v2', draftKey=()=>`nano4you_draft_${session?.user?.id||'none'}`;
const pendingKey=()=>`nano4you_pending_${session?.user?.id||'none'}`;
const msg=(x)=>{$('nanoFlash').textContent=x};
function tokenHeaders(){return {'apikey':KEY,'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'}}
async function request(path,method='GET',body,extra={}){
 if(!navigator.onLine)throw Error('Sem conexão. Dados mantidos no aparelho.');
 await refreshIfNeeded();
 const r=await fetch(URLBASE+path,{method,headers:{...tokenHeaders(),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 if(!r.ok){let err=await r.text();try{const j=JSON.parse(err);err=j.message||j.error_description||j.msg||err}catch{}throw Error(err.slice(0,280))}
 if(r.status===204)return null;const txt=await r.text();return txt?JSON.parse(txt):null;
}
function persistSession(){localStorage.setItem(sessionKey,JSON.stringify(session))}
async function refreshIfNeeded(){if(!session)throw Error('Faça login.');if(Date.now()<session.expires_at-90000)return;
 if(!navigator.onLine)throw Error('Sessão precisa ser renovada. Conecte-se para sincronizar.');
 const r=await fetch(URLBASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'apikey':KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
 if(!r.ok){session=null;localStorage.removeItem(sessionKey);throw Error('Sessão expirada; faça login novamente.')}const j=await r.json();session={access_token:j.access_token,refresh_token:j.refresh_token,user:j.user,expires_at:Date.now()+j.expires_in*1000};persistSession();
}
async function loadProfile(){const rows=await request('/rest/v1/nano_vendedores?select=id,nome,perfil,ativo,auth_user_id&auth_user_id=eq.'+encodeURIComponent(session.user.id));const p=rows?.[0];if(!p||!p.ativo)throw Error('Conta sem cadastro ativo na Nano4You. Solicite autorização ao administrador.');profile=p;}
function applyRole(){const isAdmin=profile?.perfil==='administrador';for(const id of ['preco','desconto','adicionais']){$(id).readOnly=!isAdmin;$(id).title=isAdmin?'':'Alterações de preços são exclusivas do administrador';}if(!isAdmin){$('preco').value='85';$('desconto').value='0';$('adicionais').value='0';} $('vendedor').value=profile.nome;$('vendedor').readOnly=true;S.recalc();$('nanoWho').textContent=`${profile.nome} · ${isAdmin?'Administrador':'Vendedor'}`;}
function draftsGet(){try{return JSON.parse(localStorage.getItem(draftKey())||'null')}catch{return null}}
function draftsSave(){if(!session)return;try{localStorage.setItem(draftKey(),JSON.stringify(S.collect()))}catch{msg('Armazenamento cheio. Exporte o JSON!')}}
let saveTimeout;document.querySelector('#f').addEventListener('input',()=>{clearTimeout(saveTimeout);saveTimeout=setTimeout(draftsSave,250)},true);
function showApp(){ $('nanoAccess').style.display='none';$('nanoBar').style.display='flex';const d=draftsGet();if(d)S.apply(d);applyRole();msg(navigator.onLine?'Conectado · rascunho local disponível':'Offline · preenchimento local');}
function hideApp(){ $('nanoAccess').style.display='flex';$('nanoBar').style.display='none';$('nanoHistory').style.display='none';}
async function login(){const text=$('nanoLoginMsg');text.textContent='';if(!ready){text.textContent='Conexão não configurada: preencha o arquivo config.js antes de publicar.';return}const email=$('nanoEmail').value.trim(),password=$('nanoPassword').value;if(!email||!password){text.textContent='Informe e-mail e senha.';return}try{const r=await fetch(URLBASE+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'apikey':KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const j=await r.json();if(!r.ok)throw Error(j.error_description||j.msg||j.message||'Login recusado');session={user:j.user,access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+j.expires_in*1000};await loadProfile();persistSession();$('nanoPassword').value='';showApp()}catch(e){session=null;text.textContent=e.message}}
async function boot(){try{if(!ready)throw Error('Configure config.js com URL e chave publicável do Supabase.');session=JSON.parse(localStorage.getItem(sessionKey)||'null');if(!session)return;await loadProfile();showApp()}catch(e){if(session&&!navigator.onLine){const p=JSON.parse(localStorage.getItem('nano4you_cached_profile_'+session.user.id)||'null');if(p){profile=p;showApp();msg('Offline: somente rascunho; sincronização exige internet.');return}}hideApp();$('nanoLoginMsg').textContent=e.message;session=null;localStorage.removeItem(sessionKey)}}
// Cache profile only after successful authentication; local drafts never uploaded without active session.
const oldShow=showApp;showApp=function(){oldShow();if(navigator.onLine&&profile)localStorage.setItem('nano4you_cached_profile_'+session.user.id,JSON.stringify(profile))};
function validate(d){if(!d.cliente?.trim())throw Error('Preencha o nome do cliente.');const v=S.recalc();if(!(v.area>0))throw Error('Informe largura e altura dos trechos.');if(!profile)throw Error('Faça login antes de salvar.');if(profile.perfil!=='administrador'&&(Number(d.preco)!==85||Number(d.desconto)!==0||Number(d.adicionais)!==0))throw Error('Preço e descontos são exclusivos do administrador.');return v}
function queue(){try{return JSON.parse(localStorage.getItem(pendingKey())||'[]')}catch{return []}}
function setQueue(q){localStorage.setItem(pendingKey(),JSON.stringify(q))}
async function syncOne(item){let data=item.data,v=item.calc;
 const c=await request('/rest/v1/nano_clientes','POST',{vendedor_id:profile.id,nome_cliente:data.cliente,responsavel:data.responsavel||null,telefone:data.whatsapp||null,endereco:data.endereco||null,cidade:data.cidade||null,observacoes:data.condicoes||null},{'Prefer':'return=representation'});const client=c[0];
 const payload={cliente_id:client.id,vendedor_id:profile.id,area_m2:Number(v.area.toFixed(2)),valor_m2:profile.perfil==='administrador'?Number(data.preco):85,valor_adicional:profile.perfil==='administrador'?Number(data.adicionais):0,desconto:profile.perfil==='administrador'?Number(data.desconto):0,valor_total:Number(v.total.toFixed(2)),status:profile.perfil==='administrador'&&data.status==='Aprovado'?'aprovado':'aguardando',observacoes:JSON.stringify({ficha:data,numero:data.numero,registrado_em:new Date().toISOString()})};
 await request('/rest/v1/nano_orcamentos','POST',payload,{'Prefer':'return=minimal'});
}
async function syncQueue(){if(busy)return;busy=true;try{let q=queue();if(!q.length){msg('Nenhum registro aguardando sincronização.');return}if(!navigator.onLine){msg(`${q.length} ficha(s) salva(s) offline. Sincronize ao reconectar.`);return}msg(`Sincronizando ${q.length} registro(s)...`);while(q.length){await syncOne(q[0]);q.shift();setQueue(q)}msg('Sincronização concluída. Orçamentos enviados.')}catch(e){msg('Sincronização pendente: '+e.message);alert('Falha ao sincronizar. O rascunho permanece na fila. Detalhe: '+e.message)}finally{busy=false}}
$('nanoCloudSave').onclick=async()=>{try{const d=S.collect(),v=validate(d);const q=queue();q.push({id:crypto.randomUUID?.()||String(Date.now()),data:d,calc:v});setQueue(q);draftsSave();msg(`Ficha salva localmente. ${q.length} pendente(s).`);if(navigator.onLine)await syncQueue()}catch(e){alert(e.message)}};
$('nanoSyncPending').onclick=syncQueue;
$('nanoLogin').onclick=login;$('nanoPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('nanoExit').onclick=()=>{if(!confirm('Sair da conta neste aparelho? Rascunhos offline permanecerão armazenados localmente.'))return;session=null;profile=null;localStorage.removeItem(sessionKey);S.apply({cliente:'',responsavel:'',whatsapp:'',endereco:'',cidade:'',vendedor:'',numero:'',preco:'85',adicionais:'0',desconto:'0',trechos:[{},{},{}]});hideApp()};
$('nanoHistoryBtn').onclick=async()=>{const pane=$('nanoHistory');pane.style.display='block';pane.scrollIntoView({behavior:'smooth'});$('nanoHistoryList').textContent='Consultando...';try{const rows=await request('/rest/v1/nano_orcamentos?select=id,area_m2,valor_total,status,created_at,cliente_id&order=created_at.desc&limit=50');const el=$('nanoHistoryList');el.replaceChildren();rows.forEach(r=>{const x=document.createElement('li');x.textContent=`${new Date(r.created_at).toLocaleDateString('pt-BR')} · ${r.area_m2} m² · ${Number(r.valor_total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · ${r.status}`;el.append(x)});if(!rows.length)el.textContent='Nenhum orçamento sincronizado.';const p=document.createElement('p');p.textContent=`Na fila local: ${queue().length} registro(s).`;el.append(p)}catch(e){$('nanoHistoryList').textContent='Não foi possível carregar o histórico: '+e.message}};
$('nanoCloseHistory').onclick=()=>$('nanoHistory').style.display='none';
window.addEventListener('online',()=>{if(session)msg('Conectado. Use Salvar / sincronizar para enviar fichas pendentes.');});window.addEventListener('offline',()=>{if(session)msg('Sem conexão: seus rascunhos continuam locais.');});
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
boot();
})();
