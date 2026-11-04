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
function applyRole(){const isAdmin=profile?.perfil==='administrador';$('numero').readOnly=true;$('numero').placeholder='Gerado ao sincronizar';$('numero').value='';for(const id of ['preco','desconto','adicionais']){$(id).readOnly=!isAdmin;$(id).title=isAdmin?'':'Alterações de preços são exclusivas do administrador';}if(!isAdmin){$('preco').value='85';$('desconto').value='0';$('adicionais').value='0';} $('vendedor').value=profile.nome;$('vendedor').readOnly=true;S.recalc();$('nanoAdminBtn').style.display=isAdmin?'inline-block':'none';$('nanoDiscountAlert').style.display='none';if(isAdmin&&navigator.onLine)nanoRefreshDiscountAlert().catch(()=>{});$('nanoWho').textContent=`${profile.nome} · ${isAdmin?'Administrador':'Vendedor'}`;}
function draftsGet(){try{return JSON.parse(localStorage.getItem(draftKey())||'null')}catch{return null}}
function draftsSave(){if(!session)return;try{localStorage.setItem(draftKey(),JSON.stringify(S.collect()))}catch{msg('Armazenamento cheio. Exporte o JSON!')}}
let saveTimeout;document.querySelector('#f').addEventListener('input',()=>{clearTimeout(saveTimeout);saveTimeout=setTimeout(draftsSave,250)},true);
function showApp(){ $('nanoAccess').style.display='none';$('nanoBar').style.display='flex';const d=draftsGet();if(d)S.apply(d);applyRole();msg(navigator.onLine?'Conectado · rascunho local disponível':'Offline · preenchimento local');}
function hideApp(){ $('nanoAccess').style.display='flex';$('nanoBar').style.display='none';$('nanoHistory').style.display='none';$('nanoAdmin').style.display='none';$('nanoAdminDetail').style.display='none';$('nanoDiscountAlert').style.display='none';}
async function login(){const text=$('nanoLoginMsg');text.textContent='';if(!ready){text.textContent='Conexão não configurada: preencha o arquivo config.js antes de publicar.';return}const email=$('nanoEmail').value.trim(),password=$('nanoPassword').value;if(!email||!password){text.textContent='Informe e-mail e senha.';return}try{const r=await fetch(URLBASE+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'apikey':KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const j=await r.json();if(!r.ok)throw Error(j.error_description||j.msg||j.message||'Login recusado');session={user:j.user,access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+j.expires_in*1000};await loadProfile();persistSession();$('nanoPassword').value='';showApp()}catch(e){session=null;text.textContent=e.message}}
async function boot(){try{if(!ready)throw Error('Configure config.js com URL e chave publicável do Supabase.');session=JSON.parse(localStorage.getItem(sessionKey)||'null');if(!session)return;await loadProfile();showApp()}catch(e){if(session&&!navigator.onLine){const p=JSON.parse(localStorage.getItem('nano4you_cached_profile_'+session.user.id)||'null');if(p){profile=p;showApp();msg('Offline: somente rascunho; sincronização exige internet.');return}}hideApp();$('nanoLoginMsg').textContent=e.message;session=null;localStorage.removeItem(sessionKey)}}
// Cache profile only after successful authentication; local drafts never uploaded without active session.
const oldShow=showApp;showApp=function(){oldShow();if(navigator.onLine&&profile)localStorage.setItem('nano4you_cached_profile_'+session.user.id,JSON.stringify(profile))};
const nanoRequiredFields=[['cliente','Nome da empresa'],['endereco','Endereço'],['whatsapp','Telefone / WhatsApp'],['responsavel','Nome do responsável']];
function nanoMarkRequiredErrors(missing){
 const box=$('nanoRequiredErrors');
 for(const [key] of nanoRequiredFields){const el=$(key);if(!el)continue;const bad=missing.some(x=>x[0]===key);el.classList.toggle('nano-required-invalid',bad);el.setAttribute('aria-invalid',bad?'true':'false');const label=document.querySelector('label[for="'+key+'"]');label?.classList.toggle('nano-required-label-error',bad)}
 if(!box)return;
 box.replaceChildren();
 if(!missing.length){box.style.display='none';return}
 const intro=document.createElement('strong');intro.textContent='Para salvar, preencha os seguintes campos obrigatórios:';
 const list=document.createElement('ul');for(const [,label] of missing){const item=document.createElement('li');item.textContent=label;list.append(item)}
 box.append(intro,list);box.style.display='block';
}
for(const [key] of nanoRequiredFields){$(key)?.addEventListener('input',()=>{const missing=nanoRequiredFields.filter(([id])=>!$(id)?.value.trim());nanoMarkRequiredErrors(missing)})}
function validate(d){const missing=nanoRequiredFields.filter(([key])=>!String(d[key]||'').trim());if(!['pag_pix','pag_debito','pag_credito','pag_dinheiro'].some(k=>d[k]===true))throw Error('Selecione ao menos uma forma de pagamento antes de salvar a vistoria.');nanoMarkRequiredErrors(missing);if(missing.length){$(missing[0][0])?.focus();throw Error('Faltam '+missing.length+' campo(s) obrigatório(s), destacados em vermelho no cadastro.');}const v=S.recalc();if(!(v.area>0))throw Error('Informe largura e altura dos trechos.');if(!profile)throw Error('Faça login antes de salvar.');if(profile.perfil!=='administrador'&&(Number(d.preco)!==85||Number(d.desconto)!==0||Number(d.adicionais)!==0))throw Error('Preço e descontos são exclusivos do administrador.');return v}
function queue(){try{return JSON.parse(localStorage.getItem(pendingKey())||'[]')}catch{return []}}
function setQueue(q){localStorage.setItem(pendingKey(),JSON.stringify(q))}
// Fotos são guardadas em IndexedDB para sobreviver a recargas e períodos offline.
const PHOTO_DB='nano4you_fotos_pendentes_v1';
function photoDb(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(Error('Este navegador não permite guardar fotos offline.'));const r=indexedDB.open(PHOTO_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('fotos'))r.result.createObjectStore('fotos')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Falha no armazenamento das fotos'))})}
async function photoWrite(key,value){const db=await photoDb();return new Promise((resolve,reject)=>{const tx=db.transaction('fotos','readwrite');tx.objectStore('fotos').put(value,key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function photoRead(key){const db=await photoDb();return new Promise((resolve,reject)=>{const tx=db.transaction('fotos','readonly');const r=tx.objectStore('fotos').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close()})}
async function photoRemove(key){const db=await photoDb();return new Promise((resolve,reject)=>{const tx=db.transaction('fotos','readwrite');tx.objectStore('fotos').delete(key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
const photoFile=(f)=>({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'})[String(f.name||'').split('.').pop().toLowerCase()];
async function savePhotos(itemId){const selected=[...($('fotos')?.files||[])].slice(0,8);for(const f of selected){if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.type!==photoFile(f))throw Error('Use somente imagens JPG, PNG ou WebP.');if(f.size>5*1024*1024)throw Error('Cada foto deve ter até 5 MB.');}if(!selected.length)return 0;await photoWrite(itemId,selected.map(f=>({blob:f,name:f.name,type:f.type})));return selected.length}
function stableId(){if(!crypto.randomUUID)throw Error('Navegador incompatível com identificação segura de orçamentos.');return crypto.randomUUID()}
async function exists(table,id){const rows=await request(`/rest/v1/${table}?select=id&id=eq.${encodeURIComponent(id)}&limit=1`);return !!rows?.length}
async function uploadOnePhoto(path,photo){await refreshIfNeeded();const r=await fetch(URLBASE+'/storage/v1/object/nano4you-fotos/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':photo.type,'x-upsert':'false'},body:photo.blob});if(!r.ok){const t=await r.text();let j;try{j=JSON.parse(t)}catch{}if(r.status===409&&(j?.statusCode==='409'||/already exists|resource already exists|duplicate/i.test(t)))return;throw Error('Foto não enviada: '+(j?.message||j?.error||t).slice(0,180))}}
async function syncOne(item){const d=item.data,v=item.calc;for(const [key,label] of [['cliente','empresa'],['endereco','endereço'],['whatsapp','telefone'],['responsavel','responsável']])if(!String(d[key]||'').trim())throw Error('Ficha pendente incompleta: '+label+'. Corrija e salve uma nova ficha antes de sincronizar.');const sellerId=item.vendedorId||profile.id;
 if(sellerId!==profile.id)throw Error('Esta ficha pertence a outra conta.');
 // IDs persistentes evitam duplicar cliente/orçamento quando uma tentativa falha após gravar parte dos dados.
 if(!item.clientId||!item.orderId)throw Error('Ficha antiga sem identificadores de sincronização. Não reenviar automaticamente; solicite revisão para evitar duplicidade.');
 if(!await exists('nano_clientes',item.clientId))await request('/rest/v1/nano_clientes','POST',{id:item.clientId,vendedor_id:sellerId,nome_cliente:d.cliente,responsavel:d.responsavel||null,telefone:d.whatsapp||null,endereco:d.endereco||null,cidade:d.cidade||null,observacoes:d.condicoes||null},{Prefer:'return=minimal'});
 const payload={id:item.orderId,cliente_id:item.clientId,vendedor_id:sellerId,area_m2:Number(v.area.toFixed(2)),valor_m2:profile.perfil==='administrador'?Number(d.preco):85,valor_adicional:profile.perfil==='administrador'?Number(d.adicionais):0,desconto:profile.perfil==='administrador'?Number(d.desconto):0,valor_total:Number(v.total.toFixed(2)),status:profile.perfil==='administrador'&&d.status==='Aprovado'?'aprovado':'aguardando',observacoes:JSON.stringify({ficha:d,numero:d.numero,registrado_em:item.createdAt,tem_fotos:!!item.photoCount})};
 if(!await exists('nano_orcamentos',item.orderId))await request('/rest/v1/nano_orcamentos','POST',payload,{Prefer:'return=minimal'});
 const photos=await photoRead(item.id)||[];
 if(item.photoCount&&photos.length!==item.photoCount)throw Error('Fotos offline ausentes. A ficha foi salva, mas é necessário recuperar as imagens antes de concluir.');
 for(let i=0;i<photos.length;i++){const f=photos[i],ext=f.type==='image/png'?'png':f.type==='image/webp'?'webp':'jpg';const path=`${session.user.id}/${item.orderId}/foto-${String(i+1).padStart(2,'0')}.${ext}`;await uploadOnePhoto(path,f)}
}
async function syncQueue(){if(busy)return;busy=true;try{let q=queue();if(!q.length){msg('Nenhum registro aguardando sincronização.');return}if(!navigator.onLine){msg(`${q.length} ficha(s) salva(s) offline. Sincronize ao reconectar.`);return}msg(`Sincronizando ${q.length} registro(s)...`);while(q.length){await syncOne(q[0]);await photoRemove(q[0].id);const done=q.shift();setQueue(q);try{const result=await request('/rest/v1/nano_orcamentos?select=numero_orcamento&id=eq.'+encodeURIComponent(done.orderId));const assigned=result?.[0]?.numero_orcamento;if(assigned){$('numero').value=assigned;msg('Orçamento '+assigned+' sincronizado com sucesso.');}}catch(e){console.warn('Número não consultado:',e.message)}}if(!q.length&&!$('numero').value)msg('Sincronização concluída: orçamentos e fotos enviados.')}catch(e){msg('Sincronização pendente: '+e.message);alert('Falha ao sincronizar. A ficha continua na fila. Detalhe: '+e.message)}finally{busy=false}}
$('nanoCloudSave').onclick=async()=>{try{const d=S.collect(),v=validate(d);const item={id:stableId(),clientId:stableId(),orderId:stableId(),vendedorId:profile.id,createdAt:new Date().toISOString(),data:d,calc:v,photoCount:0};item.photoCount=await savePhotos(item.id);try{const q=queue();q.push(item);setQueue(q)}catch(e){await photoRemove(item.id);throw e}draftsSave();msg(`Ficha salva no aparelho, com ${item.photoCount} foto(s). Sincronização pendente.`);if(navigator.onLine)await syncQueue()}catch(e){alert('Não foi possível salvar a ficha: '+e.message)}};
$('nanoSyncPending').onclick=syncQueue;
$('nanoLogin').onclick=login;$('nanoPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('nanoExit').onclick=()=>{if(!confirm('Sair da conta neste aparelho? Rascunhos offline permanecerão armazenados localmente.'))return;session=null;profile=null;localStorage.removeItem(sessionKey);S.apply({cliente:'',responsavel:'',whatsapp:'',endereco:'',cidade:'',vendedor:'',numero:'',preco:'85',adicionais:'0',desconto:'0',trechos:[{},{},{}]});hideApp()};
async function showOrderPhotos(orderId,sellerId,target){const host=target||$('nanoHistory');const box=host.querySelector('#nanoPhotosResult')||document.createElement('div');box.id='nanoPhotosResult';box.textContent='Carregando fotos...';host.append(box);try{const sellers=await request('/rest/v1/nano_vendedores?select=auth_user_id&id=eq.'+encodeURIComponent(sellerId));const owner=sellers?.[0]?.auth_user_id;if(!owner)throw Error('Não foi possível identificar o vendedor.');await refreshIfNeeded();const prefix=`${owner}/${orderId}/`;const r=await fetch(URLBASE+'/storage/v1/object/list/nano4you-fotos',{method:'POST',headers:tokenHeaders(),body:JSON.stringify({prefix,limit:20,offset:0})});if(!r.ok)throw Error((await r.text()).slice(0,180));const files=(await r.json()).filter(f=>/\.(jpg|jpeg|png|webp)$/i.test(f.name));box.replaceChildren();const heading=document.createElement('p');heading.textContent=`Fotos do orçamento: ${files.length}`;box.append(heading);for(const f of files){const path=prefix+f.name;await refreshIfNeeded();const resp=await fetch(URLBASE+'/storage/v1/object/authenticated/nano4you-fotos/'+path.split('/').map(encodeURIComponent).join('/'),{headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}});if(!resp.ok)throw Error('Não foi possível abrir uma das fotos.');const blob=await resp.blob();const url=URL.createObjectURL(blob);const img=document.createElement('img');img.src=url;img.alt='Fotografia da fachada';img.style.cssText='max-width:180px;max-height:140px;object-fit:cover;margin:5px;border-radius:8px;cursor:pointer';img.onclick=()=>window.open(url,'_blank');box.append(img);setTimeout(()=>URL.revokeObjectURL(url),5*60*1000)}if(!files.length)box.append(document.createTextNode('Nenhuma foto enviada para este orçamento.'))}catch(e){box.textContent='Erro ao visualizar fotos: '+e.message}}

// Propostas imprimíveis a partir do orçamento sincronizado: o navegador salva como PDF.
const nanoProposalEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nanoProposalText=v=>nanoProposalEscape(v||'Não informado');
function nanoProposalDate(v){if(!v)return 'A definir';const d=new Date(v.length===10?v+'T12:00:00':v);return Number.isNaN(d.getTime())?nanoProposalText(v):d.toLocaleDateString('pt-BR')}
async function nanoProposalImages(orderId,sellerId){
  const sellers=await request('/rest/v1/nano_vendedores?select=auth_user_id&id=eq.'+encodeURIComponent(sellerId));
  const owner=sellers?.[0]?.auth_user_id;if(!owner)return [];
  await refreshIfNeeded();const prefix=`${owner}/${orderId}/`;
  const r=await fetch(URLBASE+'/storage/v1/object/list/nano4you-fotos',{method:'POST',headers:tokenHeaders(),body:JSON.stringify({prefix,limit:25,offset:0})});
  if(!r.ok)throw Error('Não foi possível listar as fotos do orçamento.');
  const files=(await r.json()).filter(x=>/\.(jpg|jpeg|png|webp)$/i.test(x.name)).slice(0,6);
  const pictures=[];
  for(const f of files){
    await refreshIfNeeded();
    const url=URLBASE+'/storage/v1/object/authenticated/nano4you-fotos/'+(prefix+f.name).split('/').map(encodeURIComponent).join('/');
    const resp=await fetch(url,{headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}});
    if(!resp.ok)throw Error('Não foi possível carregar uma fotografia.');
    const blob=await resp.blob();
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Foto indisponível'));reader.readAsDataURL(blob)});
    pictures.push(dataUrl);
  }
  return pictures;
}
async function nanoGenerateProposal(order,kind){
  // Abrir a janela no clique evita bloqueio de pop-up durante consultas assíncronas.
  const popup=window.open('','_blank');
  if(!popup){alert('O navegador bloqueou a janela da proposta. Autorize pop-ups para a Nano4You e tente novamente.');return}
  popup.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Preparando proposta Nano4You</title><body style="font:16px system-ui;padding:30px">Preparando proposta comercial... Aguarde.</body></html>');popup.document.close();
  try{
    const [orders,clients,sellers]=await Promise.all([
      request('/rest/v1/nano_orcamentos?select=id,numero_orcamento,cliente_id,vendedor_id,area_m2,valor_m2,valor_adicional,desconto,valor_total,observacoes,created_at&id=eq.'+encodeURIComponent(order.id)),
      request('/rest/v1/nano_clientes?select=id,nome_cliente,responsavel,telefone,endereco,cidade&id=eq.'+encodeURIComponent(order.cliente_id)),
      request('/rest/v1/nano_vendedores?select=id,nome&id=eq.'+encodeURIComponent(order.vendedor_id))
    ]);
    const o=orders?.[0],c=clients?.[0],v=sellers?.[0];
    if(!o||!c)throw Error('Não foi possível consultar os dados atualizados do orçamento e do cliente.');
    let record={};try{record=JSON.parse(o.observacoes||'{}')}catch{}const ficha=record.ficha||{};
    let images=[];let imageWarning='';
    if(kind==='completa')try{images=await nanoProposalImages(o.id,o.vendedor_id)}catch(e){imageWarning='Fotografias não disponíveis nesta emissão. '+e.message}
    const total=Number(o.valor_total||0),gross=Number(o.area_m2||0)*Number(o.valor_m2||0),additional=Number(o.valor_adicional||0),discount=Number(o.desconto||0);
    const number=nanoProposalText(o.numero_orcamento||'Sem numeração - orçamento antigo');
    const money=n=>nanoProposalEscape(nanoDiscountAmount(n));
    const line=(k,val)=>`<div class="detail"><span>${k}</span><b>${val}</b></div>`;
    const pics=images.length?`<section class="photo-section"><h2>Registro fotográfico da fachada</h2><p class="photo-intro">Imagens registradas durante a vistoria, apresentadas para identificação das condições encontradas.</p><div class="photos ${images.length===1?'photos-single':''}">${images.map((src,i)=>`<figure><img src="${src}" alt="Foto da fachada ${i+1}"><figcaption>Foto ${i+1} · Registro da vistoria</figcaption></figure>`).join('')}</div></section>`:'';
    const areas=Array.isArray(ficha.trechos)?ficha.trechos.filter(t=>Number(t.largura)>0&&Number(t.altura)>0):[];
    const trHtml=areas.length?`<section><h2>Medições da vistoria</h2><table><thead><tr><th>Trecho</th><th>Largura</th><th>Altura</th><th>Área</th></tr></thead><tbody>${areas.map(t=>`<tr><td>${nanoProposalText(t.local||'Trecho')}</td><td>${nanoProposalText(t.largura)} m</td><td>${nanoProposalText(t.altura)} m</td><td>${(Number(t.largura)*Number(t.altura)).toLocaleString('pt-BR',{maximumFractionDigits:2})} m²</td></tr>`).join('')}</tbody></table></section>`:'';
    const observations=[ficha.condicoes,ficha.obs].filter(x=>String(x||'').trim()).map(x=>`<p>${nanoProposalText(x)}</p>`).join('');
    const payOptions=[['pag_pix','PIX'],['pag_debito','Cartão de débito'],['pag_credito','Cartão de crédito em até 10 vezes (com acréscimo sujeito a simulação e confirmação)'],['pag_dinheiro','Dinheiro']];
    const selectedPayments=payOptions.filter(([id])=>ficha[id]===true).map(([,label])=>label);
    const paymentText=nanoProposalText(selectedPayments.join(' · ')||'A combinar — orçamento anterior ao cadastro das condições de pagamento');
    const full=kind==='completa';
    const content=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${full?'Proposta completa':'Proposta resumida'} ${number} - Nano4You</title><style>
      *{box-sizing:border-box}
      body{margin:0;color:#183449;font:12.5px/1.43 Arial,Helvetica,sans-serif;background:#edf2f6}
      .sheet{max-width:820px;margin:20px auto;background:white;padding:30px 40px;box-shadow:0 5px 22px #0001}
      header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 20px;background:#073a65;color:white;border-radius:9px}
      .logo{font-size:28px;font-weight:900;letter-spacing:-1px}.logo em{color:#49d3be;font-style:normal}
      .sub{font-size:10px;letter-spacing:1.5px;color:#c6e7f6}.headright{text-align:right;font-size:11.5px}
      h1{font-size:21px;color:#073a65;margin:20px 0 3px;line-height:1.2}
      h2{font-size:14px;border-bottom:1px solid #b8d5e4;color:#075886;padding-bottom:5px;margin:15px 0 8px}
      p{margin:5px 0}section{break-inside:avoid-page}
      section.photo-section{break-inside:auto;page-break-inside:auto} .photo-section h2{break-after:avoid-page}
      .detail{display:flex;justify-content:space-between;gap:14px;padding:4px 0;border-bottom:1px solid #edf0f3}
      .detail span{color:#536a78}.detail b{text-align:right;overflow-wrap:anywhere}
      .cols{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}
      .total{margin-top:10px;background:#eaf6fa;border-left:5px solid #0874a3;padding:11px 15px;display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:17px;font-weight:bold}
      .total strong{white-space:nowrap}
      .photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}
      .photos.photos-single{grid-template-columns:minmax(0,1fr);max-width:480px;margin:0 auto}
      .photos figure{margin:0;break-inside:avoid;page-break-inside:avoid;border:1px solid #e0e9ef;border-radius:7px;padding:7px;background:#fbfdfe}
      .photos img{display:block;width:100%;height:220px;object-fit:contain;background:#f3f7f9;border-radius:5px}
      .photos.photos-single img{height:330px}
      .photos figcaption{font-size:11px;color:#536c7d;padding:6px 2px 0}
      .photo-intro{font-size:11px;color:#627786;margin:0 0 9px}
      table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #dce8ee;text-align:left;padding:6px}th{background:#eef6fa}
      .muted,footer{color:#647786;font-size:11px}
      .notice{background:#fff7e6;border-left:4px solid #d5a747;padding:9px 11px;margin-top:12px;font-size:11px;break-inside:avoid}
      footer{border-top:1px solid #cfdee7;padding-top:10px;margin-top:18px;text-align:center;break-inside:avoid}
      .toolbar{position:sticky;top:0;background:#fff;display:flex;justify-content:center;align-items:center;gap:10px;padding:12px;box-shadow:0 2px 10px #0002;flex-wrap:wrap}
      .toolbar button{border:0;border-radius:7px;padding:12px 22px;cursor:pointer;background:#08689b;color:white;font-weight:bold}
      .toolbar .secondary{background:#e2e9ec;color:#18405b}
      .print-tip{max-width:330px;color:#405d70;font-size:11px}
      @page{size:A4;margin:11mm}
      @media print{
        body{background:white;font-size:11.8px;line-height:1.35}
        .sheet{box-shadow:none;max-width:none;margin:0;padding:0}
        .toolbar{display:none!important}
        header{padding:15px 18px}
        h1{font-size:19px;margin:15px 0 3px}
        h2{margin:12px 0 7px}
        .detail{padding:3px 0}
        .total{margin-top:8px;padding:9px 13px;font-size:16px}
        .photos img{height:190px}
        .photos.photos-single img{height:300px}
        /* Proposta sem fotografias: não deixar o rodapé isolado na página 2. */
        .sheet.without-photos header{padding:12px 16px}
        .sheet.without-photos h1{font-size:18px;margin:12px 0 2px}
        .sheet.without-photos h2{font-size:12.5px;margin:9px 0 5px;padding-bottom:4px}
        .sheet.without-photos p{margin:3px 0}
        .sheet.without-photos .detail{padding:2px 0}
        .sheet.without-photos th,.sheet.without-photos td{padding:4px 6px}
        .sheet.without-photos .total{margin-top:7px;padding:8px 12px;font-size:15px}
        .sheet.without-photos .notice{margin-top:8px;padding:7px 9px;font-size:10px}
        .sheet.without-photos footer{margin-top:10px;padding-top:7px;font-size:10px}
        header,.total,.notice,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }
      @media(max-width:600px){
        .sheet{margin:0;padding:15px}.cols{grid-template-columns:1fr}
        .photos{grid-template-columns:1fr}
        header{padding:13px}.logo{font-size:22px}
        .total{font-size:15px}
      }
      </style></head><body><div class="toolbar"><button onclick="window.print()">Imprimir / Salvar em PDF</button><span class="print-tip">Para um PDF limpo, em Mais configurações desmarque “Cabeçalhos e rodapés”. O navegador controla essa opção.</span><button class="secondary" onclick="window.close()">Fechar</button></div><main class="sheet ${images.length?'with-photos':'without-photos'}"><header><div><div class="logo">NANO<em>4</em>YOU</div><div class="sub">SOLUÇÕES EM FACHADAS</div></div><div class="headright">(47) 98824-6018<br>Limpeza e revitalização de fachadas</div></header><h1>PROPOSTA COMERCIAL ${full?'COMPLETA':'RESUMIDA'}</h1><p class="muted">Nº ${number} · Registro ${nanoProposalDate(o.created_at)} · Responsável comercial: ${nanoProposalText(v?.nome||'Equipe Nano4You')}</p><section><h2>Dados do cliente</h2><div class="cols"><div>${line('Empresa',nanoProposalText(c.nome_cliente))}${line('Responsável',nanoProposalText(c.responsavel))}</div><div>${line('Telefone',nanoProposalText(c.telefone))}${line('Cidade',nanoProposalText(c.cidade))}</div></div><p><b>Endereço da fachada:</b> ${nanoProposalText(c.endereco)}</p></section><section><h2>Objeto da proposta</h2><p>Prestação de serviços de limpeza e revitalização de fachada, conforme medição e avaliação das condições técnicas, sujeita à confirmação do escopo e das necessidades de segurança e acesso.</p>${full?`<p><b>Material:</b> ${nanoProposalText(ficha.material||'A confirmar')} · <b>Conservação:</b> ${nanoProposalText(ficha.estado||'A confirmar')} · <b>Acesso:</b> ${nanoProposalText(ficha.acesso||'A avaliar')}</p>`:''}</section>${full?trHtml:''}<section><h2>Investimento</h2>${line('Área medida',nanoProposalText(o.area_m2)+' m²')}${line('Valor por m²',money(o.valor_m2))}${line('Valor-base',money(gross))}${additional?line('Custos adicionais',money(additional)):''}${discount?line('Desconto autorizado',`- ${money(discount)}`):''}<div class="total"><span>VALOR TOTAL DA PROPOSTA</span><strong>${money(total)}</strong></div></section><section><h2>Condições comerciais</h2>${line('Prazo estimado',nanoProposalText(ficha.prazo||'A definir'))}${line('Validade da proposta',nanoProposalDate(ficha.validade))}${line('Formas de pagamento',paymentText)}${full&&observations?`<h2>Observações da vistoria</h2>${observations}`:''}</section>${full?pics:''}${imageWarning?`<p class="notice">${nanoProposalText(imageWarning)}</p>`:''}<div class="notice">Proposta preliminar, sujeita à confirmação técnica e às condições de acesso. Serviços em altura dependem de avaliação de segurança. Fotografias registram as condições da visita; eventuais simulações visuais deverão ser identificadas como ilustrativas.</div><footer>Nano4You · Soluções em Fachadas · WhatsApp (47) 98824-6018<br>Documento emitido com os dados e valores registrados no sistema.</footer></main></body></html>`;
    popup.document.open();popup.document.write(content);popup.document.close();
  }catch(e){popup.document.body.textContent='Não foi possível preparar a proposta: '+e.message;alert('Falha ao gerar a proposta: '+e.message)}
}
function nanoProposalActions(host,order){
  const group=admNode('div',undefined,'nano-proposal-actions');
  const complete=admNode('button','Proposta completa (PDF)','secondary');complete.type='button';complete.onclick=()=>nanoGenerateProposal(order,'completa');
  const short=admNode('button','Proposta resumida (PDF)','secondary');short.type='button';short.onclick=()=>nanoGenerateProposal(order,'resumida');
  group.append(complete,short);host.append(group);
}

// Histórico enriquecido com nomes relacionados. Consultas respeitam as políticas RLS.
async function labelsFor(table,ids,columns){
 const unique=[...new Set(ids.filter(Boolean))];
 if(!unique.length)return new Map();
 const q=encodeURIComponent('('+unique.join(',')+')');
 const rows=await request(`/rest/v1/${table}?select=${columns}&id=in.${q}`);
 return new Map((rows||[]).map(r=>[r.id,r]));
}
$('nanoHistoryBtn').onclick=async()=>{$('nanoAdmin').style.display='none';
 const pane=$('nanoHistory');pane.style.display='block';pane.scrollIntoView({behavior:'smooth'});
 $('nanoHistoryList').textContent='Consultando...';$('nanoPhotosResult')?.remove();
 try{
  const rows=await request('/rest/v1/nano_orcamentos?select=id,numero_orcamento,area_m2,valor_m2,valor_adicional,desconto,valor_total,status,created_at,cliente_id,vendedor_id&order=created_at.desc&limit=50');
  const el=$('nanoHistoryList');el.replaceChildren();
  // Uma falha ao consultar nomes não deve impedir a consulta de orçamentos.
  let clients=new Map(),sellers=new Map(),lookupError=false;
  try{clients=await labelsFor('nano_clientes',rows.map(r=>r.cliente_id),'id,nome_cliente,cidade')}catch(e){lookupError=true;console.warn('Nomes dos clientes indisponíveis:',e.message)}
  try{if(profile?.perfil==='administrador')sellers=await labelsFor('nano_vendedores',rows.map(r=>r.vendedor_id),'id,nome')}catch(e){lookupError=true;console.warn('Nomes dos vendedores indisponíveis:',e.message)}
  const historyStages=await nanoLoadStages(rows.map(o=>o.id));
   const historyDiscounts=await nanoLoadDiscounts(rows.map(o=>o.id));
  rows.forEach(r=>{
   const li=document.createElement('li');li.style.cssText='padding:12px 0;border-bottom:1px solid #dce9f0;list-style:none';
    if(historyStages.get(r.id)?.situacao==='perdido'){li.classList.add('nano-stage-lost');li.append(admNode('span','NEGÓCIO PERDIDO','nano-stage-lost-label'));}else if((historyStages.get(r.id)?.situacao||(r.status==='aprovado'?'aprovado':'em_vistoria'))==='aprovado'){li.classList.add('nano-stage-won');li.append(admNode('span','ORÇAMENTO GANHO','nano-stage-won-label'));}
   const heading=document.createElement('strong');heading.style.cssText='display:block;color:#075886;font-size:15px;margin-bottom:4px';
   heading.textContent=clients.get(r.cliente_id)?.nome_cliente||'Cliente não identificado';li.append(heading);
   const meta=document.createElement('div');meta.style.cssText='margin-bottom:8px;color:#425b6d;font-size:13px';
   const date=new Date(r.created_at).toLocaleDateString('pt-BR');const value=Number(r.valor_total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
   meta.textContent=`${r.numero_orcamento||'Sem número (registro antigo)'} · ${date} · ${r.area_m2} m² · ${value} · ${nanoStageNames[historyStages.get(r.id)?.situacao]||admStatusLabel(r.status)}`;li.append(meta);
   const detail=[];if(clients.get(r.cliente_id)?.cidade)detail.push(clients.get(r.cliente_id).cidade);
   if(profile?.perfil==='administrador')detail.push('Vendedor: '+(sellers.get(r.vendedor_id)?.nome||'Não identificado'));
   if(detail.length){const line=document.createElement('div');line.style.cssText='color:#627786;font-size:12px;margin-bottom:8px';line.textContent=detail.join(' · ');li.append(line)}
   const b=document.createElement('button');b.type='button';b.textContent='Ver fotos';b.className='secondary';b.onclick=()=>showOrderPhotos(r.id,r.vendedor_id);li.append(b);
    nanoProposalActions(li,r);
    const stageWrap=admNode('div');stageWrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0';const stageSelect=document.createElement('select');stageSelect.style.cssText='width:auto;min-width:170px';nanoStageOptions.forEach(([v,l])=>stageSelect.add(new Option(l,v)));stageSelect.value=historyStages.get(r.id)?.situacao||(r.status==='aprovado'?'aprovado':'em_vistoria');const stageBtn=admNode('button','Atualizar situação','secondary');stageBtn.type='button';stageBtn.onclick=async()=>{let reason=null;if(stageSelect.value==='perdido'){reason=prompt('Informe obrigatoriamente o motivo da perda:');if(reason===null)return;if(!reason.trim()){alert('O motivo é obrigatório.');return}}else{reason=prompt('Observação da atualização (opcional):','');if(reason===null)return}stageBtn.disabled=true;try{await request('/rest/v1/rpc/nano_registrar_etapa','POST',{p_orcamento_id:r.id,p_situacao:stageSelect.value,p_motivo:reason?.trim()||null});$('nanoHistoryBtn').click();msg('Situação comercial atualizada.')}catch(e){alert('Não foi possível atualizar: '+e.message)}finally{stageBtn.disabled=false}};stageWrap.append(stageSelect,stageBtn);li.append(stageWrap);
    const discounts=historyDiscounts.filter(d=>d.orcamento_id===r.id);
    nanoDiscountInfo(li,discounts);
    if(!['perdido','cancelado','aprovado'].includes(stageSelect.value))nanoSellerDiscountControl(li,r,discounts);
    el.append(li);
  });
  if(!rows.length)el.textContent='Nenhum orçamento sincronizado.';
  if(lookupError){const warning=document.createElement('p');warning.className='muted';warning.textContent='Alguns nomes não puderam ser carregados. Confira a conexão e as permissões de leitura.';el.append(warning)}
  const p=document.createElement('p');p.textContent=`Na fila local: ${queue().length} registro(s).`;el.append(p);
 }catch(e){$('nanoHistoryList').textContent='Não foi possível carregar o histórico: '+e.message}
};

// PAINEL ADMINISTRATIVO: leitura autorizada, sem alteracoes financeiras neste modulo.
const admState={orders:[],clients:new Map(),sellers:new Map(),stages:new Map(),discounts:[]};
const nanoDiscountLabel={pendente:'Pendente de aprovação',aprovado:'Desconto aprovado',recusado:'Desconto recusado'};
const nanoDiscountStyles={pendente:'nano-discount-pending',aprovado:'nano-discount-approved',recusado:'nano-discount-rejected'};
const nanoDiscountIcons={pendente:'⏳',aprovado:'✓',recusado:'✕'};
function nanoDiscountBadge(status){
 const badge=admNode('span',`${nanoDiscountIcons[status]||'•'} ${nanoDiscountLabel[status]||status}`,'nano-discount-badge '+(nanoDiscountStyles[status]||''));
 badge.setAttribute('role','status');return badge;
}
function nanoSetDiscountAlert(count){
 const button=$('nanoDiscountAlert');if(!button)return;
 const show=profile?.perfil==='administrador'&&count>0;
 button.style.display=show?'inline-block':'none';
 button.textContent=`🔔 Descontos pendentes (${count})`;
 button.setAttribute('aria-label',`${count} solicitação${count===1?'':'ões'} de desconto pendente${count===1?'':'s'}. Abrir no Painel Administrativo.`);
}
async function nanoRefreshDiscountAlert(){
 if(profile?.perfil!=='administrador'||!session||!navigator.onLine)return;
 const rows=await request('/rest/v1/nano_solicitacoes_desconto?select=id&situacao=eq.pendente&limit=1000');
 if(profile?.perfil==='administrador')nanoSetDiscountAlert((rows||[]).length);
}

const nanoDiscountByOrder=(orderId)=>admState.discounts.filter(x=>x.orcamento_id===orderId);
const nanoDiscountAmount=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
async function nanoLoadDiscounts(ids){
  if(!ids.length)return [];
  const all=[];
  for(let i=0;i<ids.length;i+=80){
    const q=encodeURIComponent('('+ids.slice(i,i+80).join(',')+')');
    const rows=await request('/rest/v1/nano_solicitacoes_desconto?select=id,orcamento_id,solicitado_por,desconto_atual,desconto_solicitado,justificativa,situacao,criado_em,decidido_por,decidido_em,observacao_decisao&orcamento_id=in.'+q+'&order=criado_em.desc,id.desc&limit=1000');
    all.push(...(rows||[]));
  }
  return all;
}
function nanoDiscountInfo(host,requests){
  if(!requests.length)return;
  const latest=requests[0], card=admNode('div',undefined,nanoDiscountStyles[latest.situacao]||'');
  card.append(nanoDiscountBadge(latest.situacao));
  card.append(admNode('p',`Desconto solicitado: ${nanoDiscountAmount(latest.desconto_solicitado)} · ${new Date(latest.criado_em).toLocaleDateString('pt-BR')}`));
  if(latest.situacao==='pendente')card.append(admNode('p','Aguardando análise do administrador. O valor permanece inalterado.'));
  if(latest.situacao==='aprovado')card.append(admNode('p','Desconto autorizado e aplicado ao orçamento.'));
  if(latest.situacao==='recusado')card.append(admNode('p','Desconto recusado. O valor do orçamento foi preservado.'));
  if(latest.observacao_decisao)card.append(admNode('p','Observação da decisão: '+latest.observacao_decisao));
  host.append(card);
}
function nanoSellerDiscountControl(host,order,requests){
  if(profile?.perfil!=='vendedor')return;
  const pending=requests.some(r=>r.situacao==='pendente');
  const form=admNode('div');form.style.cssText='margin:9px 0 13px;padding:12px;border-radius:9px;background:#f1f6fa';
  form.append(admNode('strong','Solicitar desconto ao administrador'));
  if(pending){form.append(admNode('p','Já existe uma solicitação pendente para este orçamento. Aguarde a decisão.'));host.append(form);return}
  const amount=document.createElement('input');amount.type='number';amount.min='0.01';amount.step='0.01';amount.placeholder='Desconto total solicitado em R$';amount.setAttribute('aria-label','Valor total do desconto solicitado');amount.style.cssText='max-width:280px;margin:8px 0';
  const note=document.createElement('textarea');note.placeholder='Justificativa comercial (mínimo de 5 caracteres)';note.setAttribute('aria-label','Justificativa do desconto');note.style.cssText='min-height:65px;display:block;margin:6px 0 9px';
  const button=admNode('button','Enviar solicitação','secondary');button.type='button';
  const gross=Number(order.area_m2||0)*Number(order.valor_m2||0)+Number(order.valor_adicional||0);
  const hint=admNode('p',`Desconto atual: ${nanoDiscountAmount(order.desconto)} · Valor bruto: ${nanoDiscountAmount(gross)}. Informe o desconto total desejado, não a diferença.`,'muted');
  button.onclick=async()=>{
    const value=Number(amount.value);
    if(!Number.isFinite(value)||!amount.value||value<=Number(order.desconto||0)||value>=gross){alert('Informe um desconto total maior que o atual e menor que o valor bruto.');return}
    if(note.value.trim().length<5){alert('Informe uma justificativa de pelo menos cinco caracteres.');note.focus();return}
    if(!confirm(`Solicitar desconto total de ${nanoDiscountAmount(value)} para este orçamento? O valor só mudará após aprovação.`))return;
    button.disabled=true;
    try{await request('/rest/v1/rpc/nano_solicitar_desconto','POST',{p_orcamento_id:order.id,p_desconto:value,p_justificativa:note.value.trim()});msg('Solicitação enviada para análise do administrador.');$('nanoHistoryBtn').click()}
    catch(e){alert('Não foi possível solicitar desconto: '+e.message);button.disabled=false}
  };
  form.append(hint,amount,note,button);host.append(form);
}
async function nanoAdminDecide(requestRecord,approve){
  if(profile?.perfil!=='administrador')return;
  const decision=approve?'aprovar':'recusar';
  const observation=prompt(`Observação para ${decision} o desconto de ${nanoDiscountAmount(requestRecord.desconto_solicitado)} (opcional):`,'');
  if(observation===null)return;
  if(!confirm(`Confirmar decisão de ${decision} este desconto?`))return;
  try{
    await request('/rest/v1/rpc/nano_decidir_desconto','POST',{p_solicitacao_id:requestRecord.id,p_aprovar:approve,p_observacao:observation.trim()||null});
    await admReload();
    const current=admState.orders.find(o=>o.id===requestRecord.orcamento_id);
    if(current)admShowDetails(current);
    msg(approve?'Desconto aprovado. Novo valor aplicado ao orçamento.':'Desconto recusado. Valor do orçamento preservado.');
  }catch(e){alert('Decisão não registrada: '+e.message)}
}
function nanoAdminDiscountDetail(host,order){
  const requests=nanoDiscountByOrder(order.id);
  if(!requests.length)return;
  const pane=admNode('div');pane.style.cssText='padding:12px;margin:14px 0;background:#eaf5fa;border-radius:10px';
  pane.append(admNode('h3','Solicitações de desconto'));
  for(const r of requests){
    const detail=admNode('div',undefined,nanoDiscountStyles[r.situacao]||'');
    detail.append(nanoDiscountBadge(r.situacao));
    detail.append(admNode('p',`Solicitado em ${new Date(r.criado_em).toLocaleString('pt-BR')}`));
    detail.append(admNode('p',`Desconto anterior: ${nanoDiscountAmount(r.desconto_atual)} · Solicitado: ${nanoDiscountAmount(r.desconto_solicitado)}`));
    detail.append(admNode('p','Justificativa: '+r.justificativa));
    if(r.decidido_em)detail.append(admNode('p','Decidido em: '+new Date(r.decidido_em).toLocaleString('pt-BR')));
    if(r.observacao_decisao)detail.append(admNode('p','Observação da decisão: '+r.observacao_decisao));
    if(r.situacao==='pendente'){
      const actions=admNode('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
      const yes=admNode('button','Aprovar desconto');yes.type='button';yes.onclick=()=>nanoAdminDecide(r,true);
      const no=admNode('button','Recusar desconto','secondary');no.type='button';no.onclick=()=>nanoAdminDecide(r,false);
      actions.append(yes,no);detail.append(actions);
    }
    pane.append(detail);
  }
  host.append(pane);
}
function nanoRenderPendingRequests(){
  const host=$('admDiscountRequests');host.replaceChildren();
  const orderMap=new Map(admState.orders.map(o=>[o.id,o]));
  const pending=admState.discounts.filter(r=>r.situacao==='pendente');
  $('admDiscountCount').textContent=String(pending.length);nanoSetDiscountAlert(pending.length);
  if(!pending.length){host.append(admNode('p','Nenhuma solicitação pendente.','muted'));return}
  for(const r of pending){
    const order=orderMap.get(r.orcamento_id),client=admState.clients.get(order?.cliente_id)||{},seller=admState.sellers.get(order?.vendedor_id)||{};
    const card=admNode('div',undefined,'adm-item nano-discount-pending');
    card.append(nanoDiscountBadge('pendente'));
    card.append(admNode('strong',client.nome_cliente||'Cliente não identificado'));
    card.append(admNode('p',`Vendedor: ${seller.nome||'Não identificado'} · Desconto solicitado: ${nanoDiscountAmount(r.desconto_solicitado)}`));
    card.append(admNode('p',`Justificativa: ${r.justificativa}`));
    const actions=admNode('div',undefined,'adm-actions');
    const see=admNode('button','Ver orçamento','secondary');see.type='button';see.onclick=()=>{if(order)admShowDetails(order)};
    const yes=admNode('button','Aprovar');yes.type='button';yes.onclick=()=>nanoAdminDecide(r,true);
    const no=admNode('button','Recusar','secondary');no.type='button';no.onclick=()=>nanoAdminDecide(r,false);
    actions.append(see,yes,no);card.append(actions);host.append(card);
  }
}

const nanoStageNames={em_vistoria:'Em vistoria',orcamento_enviado:'Orçamento enviado',em_negociacao:'Em negociação',aprovado:'Aprovado pelo cliente',perdido:'Negócio perdido',cancelado:'Cancelado'};
const nanoStageOptions=Object.entries(nanoStageNames);
function nanoCurrentStage(o){return admState.stages.get(o.id)?.situacao||(o.status==='aprovado'?'aprovado':'em_vistoria')}
async function nanoLoadStages(ids){if(!ids.length)return new Map();let all=[];for(let i=0;i<ids.length;i+=80){const subset=ids.slice(i,i+80);const q=encodeURIComponent('('+subset.join(',')+')');const part=await request('/rest/v1/nano_etapas?select=orcamento_id,situacao,motivo,criado_em,criado_por&orcamento_id=in.'+q+'&order=criado_em.desc&limit=1000');all.push(...(part||[]))}const map=new Map();for(const a of all)if(!map.has(a.orcamento_id))map.set(a.orcamento_id,a);return map}
const admMoney=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const admStatusLabel=s=>({'aguardando':'Aguardando','aprovado':'Aprovado','solicitacao_desconto':'Solicitação de desconto','recusado':'Recusado','cancelado':'Cancelado'})[s]||s||'Sem situação';
const admNode=(tag,content,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=String(content);return el};
async function admFetchAll(table,select){let result=[];let from=0;const chunk=500;while(true){const rows=await request(`/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.desc&limit=${chunk}&offset=${from}`);result.push(...(rows||[]));if(!rows||rows.length<chunk)break;from+=chunk;if(from>20000)throw Error('Limite de 20 mil registros excedido; é necessário paginação adicional.')}return result}
function admSetOptions(id,entries,all){const el=$(id),selected=el.value;el.replaceChildren(new Option(all,''));entries.forEach(([value,label])=>el.add(new Option(label,value)));if([...el.options].some(o=>o.value===selected))el.value=selected}
function admFiltered(){const seller=$('admSeller').value,city=$('admCity').value,status=$('admStatus').value,term=$('admSearch').value.trim().toLocaleLowerCase('pt-BR'),start=$('admStart').value,end=$('admEnd').value;return admState.orders.filter(o=>{const c=admState.clients.get(o.cliente_id)||{};const date=(o.created_at||'').slice(0,10);return (!seller||o.vendedor_id===seller)&&(!city||c.cidade===city)&&(!status||nanoCurrentStage(o)===status)&&(!term||String(c.nome_cliente||'').toLocaleLowerCase('pt-BR').includes(term))&&(!start||date>=start)&&(!end||date<=end)})}
function admShowDetails(o){const box=$('nanoAdminDetail');box.style.display='block';box.replaceChildren();box.classList.toggle('nano-stage-lost',nanoCurrentStage(o)==='perdido');box.classList.toggle('nano-stage-won',nanoCurrentStage(o)==='aprovado');box.append(admNode('h2','Ficha do orçamento'));const c=admState.clients.get(o.cliente_id)||{},s=admState.sellers.get(o.vendedor_id)||{};let data={};try{data=JSON.parse(o.observacoes||'{}')}catch{}const ficha=data.ficha||{};
const fields=[['Cliente',c.nome_cliente||ficha.cliente],['Número do orçamento',o.numero_orcamento||'Registro antigo, sem número'],['Vendedor',s.nome],['Data de registro',new Date(o.created_at).toLocaleString('pt-BR')],['Cidade',c.cidade||ficha.cidade],['Endereço',c.endereco||ficha.endereco],['Responsável',c.responsavel||ficha.responsavel],['WhatsApp',c.telefone||ficha.whatsapp],['Número',data.numero||ficha.numero],['Material',ficha.material],['Conservação',ficha.estado],['Acesso',ficha.acesso],['Trabalho em altura',ficha.altura?'Sim':'Não'],['Área (m²)',o.area_m2],['Preço por m²',admMoney(o.valor_m2)],['Custos adicionais',admMoney(o.valor_adicional)],['Desconto',admMoney(o.desconto)],['Total',admMoney(o.valor_total)],['Situação comercial',nanoStageNames[nanoCurrentStage(o)]||admStatusLabel(o.status)],['Prazo',ficha.prazo],['Validade',ficha.validade],['Descrição dos custos e descontos',ficha.extrasDesc],['Observações técnicas',ficha.condicoes],['Observações comerciais',ficha.obs],['Condições',c.observacoes]];
for(const [label,value] of fields){if(value===undefined||value===null||value==='')continue;const p=admNode('p');const b=admNode('strong',label+': ');p.append(b,document.createTextNode(String(value)));box.append(p)}
if(Array.isArray(ficha.trechos)&&ficha.trechos.length){box.append(admNode('h3','Trechos da fachada'));ficha.trechos.forEach((t,i)=>box.append(admNode('p',`${i+1}. ${t.local||'Trecho'} — ${t.largura||'?'} m × ${t.altura||'?'} m`)))}
const stage=admState.stages.get(o.id);if(stage){const s=admNode('p');s.append(admNode('strong','Última atualização comercial: '),document.createTextNode(new Date(stage.criado_em).toLocaleString('pt-BR')));box.append(s);if(stage.motivo)box.append(admNode('p','Motivo / observação: '+stage.motivo))}
const editor=admNode('div',undefined,'adm-status-form');const lbl=admNode('label','Atualizar situação comercial');const sel=document.createElement('select');sel.setAttribute('aria-label','Nova situação comercial');for(const [value,title] of nanoStageOptions)sel.add(new Option(title,value));sel.value=nanoCurrentStage(o);const reason=document.createElement('textarea');reason.placeholder='Observação opcional; obrigatória para Negócio perdido';reason.setAttribute('aria-label','Motivo ou observação da mudança');reason.style.display=sel.value==='perdido'?'block':'none';sel.onchange=()=>{reason.style.display=sel.value==='perdido'?'block':'none'};const submit=admNode('button','Salvar situação');submit.type='button';submit.onclick=async()=>{if(sel.value==='perdido'&&!reason.value.trim()){alert('Informe o motivo da perda da negociação.');reason.focus();return}if(!confirm('Registrar a situação comercial deste orçamento?'))return;submit.disabled=true;try{await request('/rest/v1/rpc/nano_registrar_etapa','POST',{p_orcamento_id:o.id,p_situacao:sel.value,p_motivo:reason.value.trim()||null});await admReload();const updated=admState.orders.find(x=>x.id===o.id);if(updated)admShowDetails(updated);msg('Situação comercial registrada com sucesso.')}catch(e){alert('Não foi possível atualizar a situação: '+e.message)}finally{submit.disabled=false}};editor.append(lbl,sel,reason,submit);box.append(editor);
nanoAdminDiscountDetail(box,o);
 nanoProposalActions(box,o);
 const pb=admNode('button','Ver fotos','secondary');pb.type='button';pb.onclick=()=>showOrderPhotos(o.id,o.vendedor_id,box);box.append(pb);box.scrollIntoView({behavior:'smooth',block:'start'});
}
function admRender(){
 const orders=admFiltered(),el=$('admOrders');el.replaceChildren();
 const clients=new Set(orders.map(o=>o.cliente_id).filter(Boolean));
 const approved=orders.filter(o=>nanoCurrentStage(o)==='aprovado');
 const lost=orders.filter(o=>nanoCurrentStage(o)==='perdido');
 const open=orders.filter(o=>['em_vistoria','orcamento_enviado','em_negociacao'].includes(nanoCurrentStage(o)));
 const sum=list=>list.reduce((n,o)=>n+Number(o.valor_total||0),0);
 const approvedValue=sum(approved);
 const rate=(numerator,denominator)=>denominator?(100*numerator/denominator).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'0,0%';
 $('admClients').textContent=String(clients.size);
 $('admCount').textContent=String(orders.length);
 $('admOpen').textContent=admMoney(sum(open));
 $('admApproved').textContent=admMoney(approvedValue);
 $('admSales').textContent=String(approved.length);
 $('admConversion').textContent=rate(approved.length,orders.length);
 $('admLost').textContent=String(lost.length);
 $('admLost').closest('.adm-kpi')?.classList.add('nano-lost-kpi');$('admSales').closest('.adm-kpi')?.classList.add('nano-won-kpi');$('admApproved').closest('.adm-kpi')?.classList.add('nano-won-kpi');
 $('admTicket').textContent=admMoney(approved.length?approvedValue/approved.length:0);
 // Apenas registros da equipe, sob os filtros aplicados; uma proposta conta uma única vez.
 const rankings=new Map();
 for(const o of orders){let line=rankings.get(o.vendedor_id);if(!line){line={seller:admState.sellers.get(o.vendedor_id)?.nome||'Vendedor não identificado',count:0,approved:0,lost:0,value:0};rankings.set(o.vendedor_id,line)}line.count++;
  const stage=nanoCurrentStage(o);if(stage==='aprovado'){line.approved++;line.value+=Number(o.valor_total||0)}if(stage==='perdido')line.lost++;
 }
 const rankingBody=$('admSellerRanking');rankingBody.replaceChildren();
 const ordered=[...rankings.values()].sort((a,b)=>b.value-a.value||b.approved-a.approved||a.seller.localeCompare(b.seller,'pt-BR'));
 for(const r of ordered){const tr=document.createElement('tr');for(const value of [r.seller,r.count,r.approved,r.lost,rate(r.approved,r.count),admMoney(r.value)])tr.append(admNode('td',value));rankingBody.append(tr)}
 if(!ordered.length){const tr=admNode('tr');const td=admNode('td','Nenhum vendedor com orçamentos nos filtros selecionados.');td.colSpan=6;tr.append(td);rankingBody.append(tr)}
 const reasons=new Map();
 for(const o of lost){const raw=String(admState.stages.get(o.id)?.motivo||'').trim();const reason=raw||'Motivo não registrado';const existing=reasons.get(reason)||{count:0,value:0};existing.count++;existing.value+=Number(o.valor_total||0);reasons.set(reason,existing)}
 const reasonsEl=$('admLossReasons');reasonsEl.replaceChildren();
 if(!lost.length)reasonsEl.append(admNode('p','Nenhum negócio perdido nos filtros selecionados.','muted'));
 else{for(const [reason,r] of [...reasons.entries()].sort((a,b)=>b[1].count-a[1].count||a[0].localeCompare(b[0],'pt-BR'))){const div=admNode('div',undefined,'adm-loss-reason');div.append(admNode('span',reason),admNode('b',`${r.count} · ${admMoney(r.value)}`));reasonsEl.append(div)}}
 if(!orders.length){el.append(admNode('p','Nenhum orçamento para os filtros selecionados.'));return}
 orders.forEach(o=>{const c=admState.clients.get(o.cliente_id)||{},s=admState.sellers.get(o.vendedor_id)||{},card=admNode('article',undefined,'adm-item');if(nanoCurrentStage(o)==='perdido'){card.classList.add('nano-stage-lost');card.append(admNode('span','NEGÓCIO PERDIDO','nano-stage-lost-label'));}else if(nanoCurrentStage(o)==='aprovado'){card.classList.add('nano-stage-won');card.append(admNode('span','ORÇAMENTO GANHO','nano-stage-won-label'));}card.append(admNode('strong',c.nome_cliente||'Cliente não identificado'));card.append(admNode('p',`${new Date(o.created_at).toLocaleDateString('pt-BR')} · ${c.cidade||'Cidade não informada'} · ${s.nome||'Vendedor não identificado'}`));card.append(admNode('p',`${o.numero_orcamento||'Sem número (registro antigo)'} · ${o.area_m2} m² · ${admMoney(o.valor_total)} · ${nanoStageNames[nanoCurrentStage(o)]||admStatusLabel(o.status)}`));const actions=admNode('div',undefined,'adm-actions'),detail=admNode('button','Ver ficha completa','secondary'),photos=admNode('button','Ver fotos','secondary');detail.type='button';photos.type='button';detail.onclick=()=>admShowDetails(o);photos.onclick=()=>{admShowDetails(o);showOrderPhotos(o.id,o.vendedor_id,$('nanoAdminDetail'))};actions.append(detail,photos);card.append(actions);el.append(card)})
}

function nanoRenderTeam(){
 const host=$('admTeamList');host.replaceChildren();
 const sellers=[...admState.sellers.values()].sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
 for(const s of sellers){
  const row=admNode('div',undefined,'nano-team-item');if(!s.ativo)row.classList.add('nano-team-inactive');
  const info=admNode('div');info.append(admNode('strong',s.nome||'Sem nome'),admNode('p',s.perfil==='administrador'?'Administrador':'Vendedor','muted'));
  const status=admNode('span',s.ativo?'Ativo':'Desativado','nano-team-status');
  row.append(info,status);
  if(s.perfil==='vendedor'){
   const action=admNode('button',s.ativo?'Desativar acesso':'Reativar acesso',s.ativo?'danger':'green');action.type='button';
   action.onclick=async()=>{
    const next=!s.ativo;
    if(!confirm(`${next?'Reativar':'Desativar'} o acesso de ${s.nome}? Os orçamentos e o histórico serão preservados.`))return;
    action.disabled=true;
    try{
     await request('/rest/v1/rpc/nano_alterar_acesso_vendedor','POST',{p_vendedor_id:s.id,p_ativo:next});
     await admReload();
     msg(`Acesso de ${s.nome} ${next?'reativado':'desativado'} com sucesso.`);
    }catch(e){alert('Não foi possível alterar o acesso: '+e.message);action.disabled=false}
   };
   row.append(action);
  }
  host.append(row);
 }
 if(!sellers.length)host.textContent='Nenhum vendedor encontrado.';
}
async function admReload(){if(profile?.perfil!=='administrador'){return}const p=$('admMessage');p.textContent='Carregando dados da equipe...';try{const [orders,clients,sellers]=await Promise.all([admFetchAll('nano_orcamentos','id,numero_orcamento,cliente_id,vendedor_id,area_m2,valor_m2,valor_adicional,desconto,valor_total,status,observacoes,created_at'),admFetchAll('nano_clientes','id,nome_cliente,cidade,endereco,responsavel,telefone,observacoes,created_at'),admFetchAll('nano_vendedores','id,nome,perfil,ativo,auth_user_id,created_at')]);admState.orders=orders;admState.stages=await nanoLoadStages(orders.map(o=>o.id));admState.discounts=await nanoLoadDiscounts(orders.map(o=>o.id));admState.clients=new Map(clients.map(o=>[o.id,o]));admState.sellers=new Map(sellers.map(o=>[o.id,o]));admSetOptions('admSeller',sellers.map(o=>[o.id,o.nome]).sort((a,b)=>a[1].localeCompare(b[1])),'Todos');admSetOptions('admCity',[...new Set(clients.map(c=>c.cidade).filter(Boolean))].sort().map(c=>[c,c]),'Todas');admSetOptions('admStatus',nanoStageOptions,'Todas');p.textContent=`${orders.length} orçamento(s) sincronizado(s). Indicadores baseados nos orçamentos com os filtros atuais.`;admRender();nanoRenderPendingRequests();nanoRenderTeam()}catch(e){p.textContent='Erro ao consultar painel: '+e.message}}
$('nanoAdminBtn').onclick=()=>{if(profile?.perfil!=='administrador'){return}const pane=$('nanoAdmin');const opening=pane.style.display!=='block';pane.style.display=opening?'block':'none';$('nanoHistory').style.display='none';if(opening){pane.scrollIntoView({behavior:'smooth'});admReload()}};
$('admClose').onclick=()=>$('nanoAdmin').style.display='none';$('admReload').onclick=admReload;
$('nanoDiscountAlert').onclick=async()=>{
  if(profile?.perfil!=='administrador')return;
  $('nanoAdmin').style.display='block';$('nanoHistory').style.display='none';
  await admReload();
  $('admDiscountSection').scrollIntoView({behavior:'smooth',block:'start'});
};
// Atualiza o aviso quando o administrador volta à aba do navegador.
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&profile?.perfil==='administrador'&&navigator.onLine)nanoRefreshDiscountAlert().catch(()=>{});
});
$('admReset').onclick=()=>{for(const id of ['admSeller','admCity','admStatus','admSearch','admStart','admEnd'])$(id).value='';admRender()};
for(const id of ['admSeller','admCity','admStatus','admSearch','admStart','admEnd'])$(id).addEventListener('input',admRender);

$('nanoCloseHistory').onclick=()=>$('nanoHistory').style.display='none';
window.addEventListener('online',()=>{if(session){msg('Conectado. Use Salvar / sincronizar para enviar fichas pendentes.');if(profile?.perfil==='administrador')nanoRefreshDiscountAlert().catch(()=>{});}});window.addEventListener('offline',()=>{if(session)msg('Sem conexão: seus rascunhos continuam locais.');});
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
boot();
})();
