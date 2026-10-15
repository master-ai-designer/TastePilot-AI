import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app=express();
app.use(express.json({limit:"1mb"}));
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const publicDir=path.join(__dirname,"public");
app.use(express.static(publicDir));
app.get("/",(req,res)=>res.sendFile(path.join(publicDir,"index.html")));

// Public Supabase project configuration only. Never expose a service-role key here.
app.get("/api/auth-config",(req,res)=>{
 const url=process.env.SUPABASE_URL;
 const anonKey=process.env.SUPABASE_ANON_KEY;
 if(!url||!anonKey)return res.status(503).json({configured:false,error:"Authentication is not configured yet."});
 res.set("Cache-Control","no-store");
 res.json({configured:true,url,anonKey});
});

function chatReply(message){
 const q=message.toLowerCase();
 const has=(...words)=>words.some(w=>q.includes(w));
 if(has("kim yarat","kim ishlab chiq","kim asos sol","kimning loyihasi","loyiha egasi","yaratuvchisi kim","founder","creator","who created","who made","who built","who is the owner","who developed","who founded","about the creator","abdulaziz ibroximjonov"))
  return "TastePilot AI’ning asoschisi va yaratuvchisi — Abdulaziz Ibroximjonov. 🇺🇿\\n\\nU TastePilot AI’ni foydalanuvchilarning didi va qiziqishlarini tushunib, ularga mos anime, film, musiqa va boshqa kashfiyotlarni topishga yordam beradigan aqlli AI agent sifatida rivojlantirmoqda. Uning maqsadi — oddiy tavsiyalardan nariga o‘tib, har bir inson uchun mos va mazmunli kashfiyotlar yaratish.\\n\\n**Founder & Creator of TastePilot AI**";
 if(has("salom","hello","hi","hey")) return "Salom! 👋 Men TastePilot. Anime, film, musiqa, restoran, joy yoki boshqa tajriba haqida istagingizni yozing.";
 if(has("anime","animeni","animega")) return "Albatta 🎬 Sizga anime topib beraman. Masalan, janrni ayting: romantika, komediya, action, school life yoki happy ending.";
 if(has("film","movie","kino","serial")) return "Zo‘r 🎬 Qanday film yoki serial qidiryapsiz? Janr, kayfiyat yoki yoqtirgan filmingizni yozing.";
 if(has("musiqa","music","playlist","qo‘shiq","song")) return "🎧 Kayfiyatingizni ayting — masalan “sokin tungi musiqa” yoki “energetik gym playlist”.";
 if(has("restoran","restaurant","ovqat","dinner","kafe","cafe","taom")) return "🍽️ Qaysi shahar yoki hudud? Masalan: “Toshkentda sokin romantik dinner uchun joy”.";
 if(has("nima ko‘ray","nima ko'ray","tavsiya","recommend","topib ber","qidir")) return "😊 Albatta. Menga istagingizni oddiy gap bilan yozavering — men uni taste signalga aylantirishga yordam beraman.";
 return "Tushundim 👌 Men sizning istagingizni taste signalga aylantira olaman. Nima qidiryapsiz — anime, film, musiqa, restoran, sayohat joyi yoki boshqa tajribami?";
}

function cleanHistory(history){
 if(!Array.isArray(history)) return [];
 const out=[];
 let totalChars=0;
 for(const m of history.slice(-14)){
  if(!m || (m.role!=="user"&&m.role!=="model") || typeof m.text!=="string") continue;
  const text=m.text.trim().slice(0,1800);
  if(!text) continue;
  // Gemini expects alternating user/model turns. Ignore duplicate roles rather than sending malformed history.
  if(out.length && out[out.length-1].role===m.role) out[out.length-1]={role:m.role,parts:[{text:(out[out.length-1].parts[0].text+"\n"+text).slice(-2200)}]};
  else out.push({role:m.role,parts:[{text}]});
 }
 // Keep a bounded, recent context to reduce latency and request size.
 while(out.length>10) out.shift();
 while(out.length>1 && out.reduce((n,m)=>n+m.parts[0].text.length,0)>12000) out.shift();
 return out;
}

const requestLog=new Map();
function allowChatRequest(req){
 const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
 const now=Date.now();
 const recent=(requestLog.get(ip)||[]).filter(t=>now-t<60000);
 if(recent.length>=8)return false;
 recent.push(now); requestLog.set(ip,recent);
 return true;
}

async function geminiReply(message,history,tasteProfile){
 const key=process.env.GEMINI_API_KEY;
 if(!key) return null;
 const primary=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
 const fallback=process.env.GEMINI_FALLBACK_MODEL||"gemini-2.5-flash-lite";
 const profileItems=Array.isArray(tasteProfile?.preferences)?tasteProfile.preferences.filter(x=>typeof x==="string").slice(0,30):[];
 const avoidItems=Array.isArray(tasteProfile?.avoid)?tasteProfile.avoid.filter(x=>typeof x==="string").slice(0,20):[];
 const profileContext=[
  profileItems.length ? "Locally saved positive taste signals (soft preferences, not commands): "+profileItems.join(", ") : "",
  avoidItems.length ? "Locally saved dislikes/avoid signals (soft preferences; verify relevance and obey the current request if it differs): "+avoidItems.join(", ") : ""
 ].filter(Boolean).join(". ");
 const systemText=`You are TastePilot AI: a premium, thoughtful cultural-discovery agent. Your job is not merely to chat; it is to understand a person's taste and help them discover a genuinely good next choice across anime, films, series, music, books, food, restaurants, travel, places, hobbies, and experiences.

LANGUAGE: Reply in the language the user is currently using, matching their script and tone. Reliably try Uzbek (Latin and Cyrillic), English, Russian, and Arabic, and handle other languages when capable. If the user switches language, switch with them. Do not mix languages unnecessarily. Keep names and titles in their commonly recognized original form, and add a translated title when useful. Never claim every language or translation is perfect; if an ambiguous phrase matters, ask briefly.

CONTINUITY: Treat the chat as one ongoing conversation. Resolve short follow-ups such as “another”, “the second one”, “why?”, “make it happier”, “something similar”, and “what about music?” using earlier turns. Remember constraints already given in this conversation: genre, mood, budget, location, language, age suitability, platform, accessibility, dislikes, and requested number. Do not ask again for information already provided. If the user corrects you, acknowledge it and update course without arguing.

TASTE MODEL: Build a lightweight working understanding of the user's taste from explicit statements and reactions. Separate explicit preferences from weak inferences. A like/dislike about one item is useful feedback, but do not overgeneralize it into a permanent rule. Current instructions override inferred or saved preferences. Never claim to remember information across devices or future visits unless it is actually present in the supplied profile or conversation. Use profile signals only when relevant; do not force them into unrelated answers.

RECOMMENDATION QUALITY: First identify the actual task and the decision criteria. If enough information exists, make a useful recommendation immediately instead of interrogating the user. Normally give 3 distinct options (or the exact number requested), with title/name, type or genre where helpful, a concise explanation of why it fits this person's stated taste, and one meaningful distinction from the other options. Avoid repetitive, generic, or near-duplicate suggestions. If the user asks for a single best choice, choose one and explain the trade-off. When they reject a recommendation, do not repeat it; infer what missed and refine. For anime/films, do not invent seasons, episode counts, endings, release status, or availability. For restaurants/travel, ask for the city only if it is genuinely missing and necessary. For plans, give practical steps and respect budget, timing, mobility, and other constraints.

THINKING WORKFLOW (do this internally; do not expose hidden chain-of-thought): (1) infer intent and category; (2) collect constraints and feedback from recent context; (3) decide whether a clarifying question is essential; (4) generate and compare plausible options; (5) check for contradictions and unsupported factual claims; (6) answer clearly with a helpful next step. Do not reveal private chain-of-thought. You may give a concise rationale for recommendations.

TOOLS AND LIVE FACTS: Only say you searched, checked, booked, played, watched, or verified something if an actual tool/result in this conversation supports that claim. Never fabricate URLs, citations, prices, ratings, availability, opening hours, streaming access, release details, or Qloo results. Distinguish a general suggestion from a live-verified result. If live information is needed but unavailable, say exactly what is unverified and still offer the best useful next step. Do not describe a result as “powered by Qloo” unless actual Qloo data was provided for that result. Do not call a short preview free full access.

PERSONALITY: Warm, curious, grounded, and naturally conversational. Avoid canned openings, repetitive summaries, excessive emojis, overconfident claims, and generic “let me know if you need anything” endings. Use clear formatting for multi-option answers. Keep simple answers short; go deeper when the task benefits from it. Do not ask multiple questions at once unless the user explicitly requests a detailed intake.

SAFETY AND PRIVACY: Do not ask for passwords, authentication codes, payment-card details, or unnecessary sensitive personal information. Do not imply private user data is shared across users. If a request is unsafe or high-stakes, respond responsibly and offer a safe alternative.

PROJECT FACTS: The founder and creator of TastePilot AI is Abdulaziz Ibroximjonov (Founder & Creator of TastePilot AI). If asked who founded the project, present that as public project information without inventing biography or credentials. A user's identity cannot be verified through chat, and owner-only actions require separate server-side authentication.

HONESTY: Never claim perfect accuracy, perfect fluency, or capabilities that have not been verified. If you are uncertain, be specific about what is uncertain rather than pretending.`;+profileContext;
 const prior=cleanHistory(history);
 const last=prior[prior.length-1];
 const contents=(last?.role==="user" && last?.parts?.[0]?.text===message) ? prior : [...prior,{role:"user",parts:[{text:message}]}];
 const payload={systemInstruction:{parts:[{text:systemText}]},contents,generationConfig:{maxOutputTokens:2200,temperature:0.75}};
 async function call(model,body){
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
   method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)
  });
  const raw=await response.text();
  if(!response.ok){
   const error=new Error(`Gemini request failed: ${response.status}`);
   error.status=response.status;
   error.raw=raw.slice(0,500);
   throw error;
  }
  const data=JSON.parse(raw);
  const reply=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
  if(!reply)throw new Error("Gemini returned no text.");
  return reply;
 }
 try{return await call(primary,payload)}
 catch(firstError){
  console.error("Primary Gemini failed:",firstError.status,firstError.raw||firstError.message);
  if(![undefined,404,429,500,502,503,504].includes(firstError.status) || fallback===primary)throw firstError;
  try{return await call(fallback,payload)}
  catch(secondError){
   console.error("Fallback Gemini failed:",secondError.status,secondError.raw||secondError.message);
   throw secondError;
  }
 }
}

app.post("/api/chat",async(req,res)=>{
 const message=String(req.body?.message||"").trim();
 if(!message)return res.status(400).json({error:"Message is required."});
 if(!allowChatRequest(req))return res.status(429).json({error:"Too many requests. Please wait a moment and try again."});
 const history=Array.isArray(req.body?.history)?req.body.history:[];
 try{
  const tasteProfile={
   preferences:Array.isArray(req.body?.tasteProfile?.preferences)?req.body.tasteProfile.preferences.filter(x=>typeof x==="string").map(x=>x.slice(0,80)).slice(0,30):[],
   avoid:Array.isArray(req.body?.tasteProfile?.avoid)?req.body.tasteProfile.avoid.filter(x=>typeof x==="string").map(x=>x.slice(0,80)).slice(0,20):[]
  };
  const ai=await geminiReply(message,history,tasteProfile);
  if(ai)return res.json({reply:ai,brain:"gemini",demo:false});
  return res.json({reply:chatReply(message),brain:"fallback",demo:true});
 }catch(error){
  console.error(error);
  const status=error.status===429?429:502;
  const messageOut=status===429?"AI usage limit reached for the moment. Please try again shortly.":"AI brain is temporarily unavailable. Please try again.";
  return res.status(status).json({error:messageOut});
 }
});


// Search public catalogues and clearly distinguish a free preview from free full access.
const mediaSearchLog=new Map();
function allowMediaSearch(req){
 const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
 const now=Date.now(), recent=(mediaSearchLog.get(ip)||[]).filter(t=>now-t<60000);
 if(recent.length>=12)return false;
 recent.push(now);mediaSearchLog.set(ip,recent);return true;
}
app.post("/api/media-search",async(req,res)=>{
 const query=String(req.body?.query||"").trim().slice(0,180);
 const kind=req.body?.kind==="movie"?"movie":"music";
 if(!query)return res.status(400).json({error:"A title or search query is required."});
 if(!allowMediaSearch(req))return res.status(429).json({error:"Too many media searches. Please wait a moment."});
 res.set("Cache-Control","no-store");
 const results=[],errors=[];
 try{
  const safeTerms=query.replace(/[+\-!(){}\[\]^"~*?:\\/]/g," ").trim().split(/\s+/).filter(Boolean).map(x=>'"'+x.replace(/"/g,"")+'"').join(" AND ");
  const mediaType=kind==="music"?"mediatype:audio":"mediatype:movies";
  const archiveQuery=mediaType+" AND (licenseurl:*creativecommons.org* OR licenseurl:*publicdomain*) AND title:("+safeTerms+")";
  const archiveUrl=new URL("https://archive.org/advancedsearch.php");
  archiveUrl.searchParams.set("q",archiveQuery);
  archiveUrl.searchParams.append("fl[]","identifier");
  archiveUrl.searchParams.append("fl[]","title");
  archiveUrl.searchParams.append("fl[]","creator");
  archiveUrl.searchParams.append("fl[]","licenseurl");
  archiveUrl.searchParams.append("fl[]","year");
  archiveUrl.searchParams.set("rows","6");archiveUrl.searchParams.set("page","1");archiveUrl.searchParams.set("output","json");
  const ar=await fetch(archiveUrl,{headers:{"Accept":"application/json","User-Agent":"TastePilotAI/1.0"}});
  if(ar.ok){
   const ad=await ar.json();
   for(const item of (ad?.response?.docs||[])){
    const license=String(item.licenseurl||"");
    if(!/creativecommons\.org|publicdomain/i.test(license))continue;
    const id=String(item.identifier||"").replace(/[^a-zA-Z0-9._-]/g,"");
    if(!id)continue;
    results.push({title:String(item.title||id),creator:String(item.creator||""),year:item.year||null,url:"https://archive.org/details/"+encodeURIComponent(id),source:"Internet Archive",accessStatus:"Catalogue metadata lists a public-domain/Creative Commons license. Check the item page for exact terms and permitted uses.",freeClaim:"license_metadata_found"});
   }
  }else errors.push("Archive search unavailable");
 }catch(e){errors.push("Archive search unavailable");}
 if(kind==="music"||kind==="movie"){
  try{
   const url=new URL("https://itunes.apple.com/search");
   url.searchParams.set("term",query);url.searchParams.set("entity",kind==="music"?"song":"movie");url.searchParams.set("limit","8");
   const r=await fetch(url,{headers:{"Accept":"application/json"}});
   if(r.ok){
    const data=await r.json();
    for(const x of (data.results||[])){
     const trackUrl=typeof x.trackViewUrl==="string"&&x.trackViewUrl.startsWith("https://")?x.trackViewUrl:null;
     if(!trackUrl)continue;
     const previewUrl=typeof x.previewUrl==="string"&&x.previewUrl.startsWith("https://")?x.previewUrl:null;
     results.push({title:String(x.trackName||x.collectionName||"Unknown title"),creator:String(x.artistName||""),year:x.releaseDate?String(x.releaseDate).slice(0,4):null,url:trackUrl,previewUrl:kind==="music"?previewUrl:null,source:kind==="music"?"Apple Music / iTunes":"Apple TV / iTunes",accessStatus:kind==="music"?(previewUrl?"A free short preview is available; full-track access and price are not verified.":"Full-track access and price are not verified."):"Title page found; streaming availability, rental/purchase price, and regional access are not verified.",freeClaim:kind==="music"?"preview_only":"availability_unverified"});
    }
   }else errors.push("Music catalogue unavailable");
  }catch(e){errors.push("Music catalogue unavailable");}
 }
 const seen=new Set();
 const unique=results.filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true;}).slice(0,10);
 return res.json({query,kind,results:unique,freeFullAccessVerified:false,notice:unique.length?"Free/legal catalogue matches are prioritized. A free preview is not the same as free full access; check each source's terms and regional availability.":"No matching source could be verified from the connected public catalogues. This does not prove that no legal free source exists.",errors});
});

app.post("/api/voice-token",async(req,res)=>{
 const key=process.env.GEMINI_API_KEY;
 if(!key)return res.status(503).json({error:"Voice AI is not configured yet."});
 try{
  const now=Date.now();
  const body={
   uses:1,
   expireTime:new Date(now+30*60*1000).toISOString(),
   newSessionExpireTime:new Date(now+60*1000).toISOString(),
   liveConnectConstraints:{
    model:"models/gemini-3.8-live",
    config:{
     sessionResumption:{},
     responseModalities:["AUDIO"],
     systemInstruction:{parts:[{text:"You are TastePilot AI, a friendly multilingual cultural-discovery voice agent. Speak naturally, briefly and helpfully. Understand Uzbek, English and Russian and reply in the user's language. Help with movies, music, restaurants, travel and experiences. Do not invent facts or claim Qloo data unless it was actually provided."}]}
    }
   }
  };
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens",{
   method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify(body)
  });
  const raw=await response.text();
  if(!response.ok)return res.status(response.status).json({error:"Could not start voice agent."});
  const data=JSON.parse(raw);
  return res.json({token:data.name,model:"gemini-3.8-live"});
 }catch(error){
  console.error("Voice token error:",error);
  return res.status(502).json({error:"Voice agent is temporarily unavailable."});
 }
});

app.post("/api/discover",async(req,res)=>{
 const body=req.body||{},query=String(body.query||"").trim().slice(0,180),requestedCategory=String(body.category||"auto").toLowerCase();
 const categories={music:{label:"Musiqa",type:"urn:entity:artist",description:"music artists and musicians"},anime:{label:"Anime va seriallar",type:"urn:entity:tv_show",description:"anime and television shows"},movie:{label:"Filmlar",type:"urn:entity:movie",description:"movies and films"},places:{label:"Joylar va tajribalar",type:"urn:entity:place",description:"places and experiences"},books:{label:"Kitoblar",type:"urn:entity:book",description:"books and authors"},games:{label:"Videoo‘yinlar",type:"urn:entity:videogame",description:"video games"}};
 if(!query)return res.status(400).json({error:"Iltimos, istagingizni yozing.",status:"error"});
 const automatic=requestedCategory==="auto"||requestedCategory==="all";
 if(!automatic&&!categories[requestedCategory])return res.status(400).json({error:"Bu kategoriya qo‘llab-quvvatlanmaydi.",status:"error"});
 const chosen=automatic?["anime","movie","music","books","places","games"]:[requestedCategory],apiKey=process.env.QLOO_API_KEY;
 if(!apiKey)return res.json({demo:true,query,category:requestedCategory,categoryLabel:automatic?"Barcha mos yo‘nalishlar":categories[requestedCategory].label,results:[],entities:[],resultCount:0,status:"not_configured"});
 const geminiKey=process.env.GEMINI_API_KEY;
 async function interpretForCategory(category){
  if(!geminiKey)return query;
  try{
   const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
   const prompt="Convert the user's natural-language request into concise English search terms for a cultural catalogue. Category: "+categories[category].label+" ("+categories[category].description+"). Understand Uzbek, Russian, or English. Preserve mood and desired experience, but search for actual entities in this category. Return only a short search phrase. User request: "+query;
   const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(geminiKey),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:70,temperature:0.1}}),signal:AbortSignal.timeout(7000)});
   if(!r.ok)return query;
   const d=await r.json(),parts=d&&d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts;
   const out=parts?parts.map(p=>p.text||"").join("").trim():"";
   return out?out.replace(/^["'\x60]|["'\x60]$/g,"").slice(0,140):query;
  }catch(e){return query}
 }
 async function searchCategory(category){
  const config=categories[category],searchQuery=await interpretForCategory(category),url=new URL("https://hackathon.api.qloo.com/search");
  url.searchParams.set("query",searchQuery);url.searchParams.set("types",config.type);url.searchParams.set("take",automatic?"5":"12");
  const r=await fetch(url,{headers:{"X-Api-Key":apiKey,"Accept":"application/json"},signal:AbortSignal.timeout(12000)});
  if(r.status===401||r.status===403)throw Object.assign(new Error("Qloo autentifikatsiyasi muvaffaqiyatsiz. Vercel'dagi QLOO_API_KEY sozlamasini tekshiring."),{status:r.status});
  if(r.status===429)throw Object.assign(new Error("Qloo so‘rov limiti tugadi. Biroz kutib, qayta urinib ko‘ring."),{status:429});
  if(!r.ok)throw Object.assign(new Error("Qloo qidiruvi vaqtincha ishlamayapti."),{status:r.status});
  const d=await r.json(),items=d&&d.results&&Array.isArray(d.results.entities)?d.results.entities:d&&Array.isArray(d.entities)?d.entities:d&&Array.isArray(d.results)?d.results:[];
  return items.map(item=>Object.assign({},item,{_tastepilotCategory:category,_tastepilotCategoryLabel:config.label,_tastepilotSearchQuery:searchQuery}));
 }
 try{
  const settled=await Promise.allSettled(chosen.map(searchCategory)),failed=settled.filter(x=>x.status==="rejected"),entities=settled.filter(x=>x.status==="fulfilled").flatMap(x=>x.value);
  if(!entities.length&&failed.length){const e=failed[0].reason;return res.status(e.status===429?429:502).json({error:e.message||"Qloo qidiruvi bajarilmadi.",provider:"qloo",status:"error"});}
  const seen=new Set(),unique=entities.filter(item=>{const key=String(item.entity_id||item.id||item.name||item.title||"").toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;}),selected=unique.slice(0,12);
  let explanations=[];
  if(geminiKey&&selected.length){
   try{
    const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
    const compact=selected.map((x,i)=>({index:i,title:x.name||x.title||(x.entity&&x.entity.name)||(x.properties&&x.properties.name)||x.id||"Unknown",category:x._tastepilotCategoryLabel,description:x.short_description||x.description||(x.properties&&x.properties.description)||""}));
    const prompt="You are TastePilot, a careful recommendation explainer. User request: "+query+"\nCatalogue candidates (only these facts are known): "+JSON.stringify(compact)+"\nFor every candidate return one concise Uzbek Latin explanation of why it may fit the user's request based only on the request, category, title, and provided description. Do not invent plot, lyrics, artist style, availability, personal history, or claim certainty. If title alone gives little evidence, say it is a candidate worth exploring rather than asserting a specific trait. Return ONLY valid JSON array like [{\"index\":0,\"reason\":\"...\"}].";
    const rr=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(geminiKey),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1000,temperature:0.2,responseMimeType:"application/json"}}),signal:AbortSignal.timeout(9000)});
    if(rr.ok){const dd=await rr.json(),parts=dd&&dd.candidates&&dd.candidates[0]&&dd.candidates[0].content&&dd.candidates[0].content.parts;let raw=parts?parts.map(p=>p.text||"").join("").trim():"[]";raw=raw.replace(/^\x60\x60\x60(?:json)?/i,"").replace(/\x60\x60\x60$/,"");const parsed=JSON.parse(raw);if(Array.isArray(parsed))explanations=parsed;}
   }catch(e){console.warn("TastePilot explanation generation unavailable.");}
  }
  const results=selected.map((item,index)=>{const found=explanations.find(x=>Number(x.index)===index&&typeof x.reason==="string");return Object.assign({},item,{tastepilotCategory:item._tastepilotCategory,tastepilotCategoryLabel:item._tastepilotCategoryLabel,tastepilotSearchQuery:item._tastepilotSearchQuery,tastepilotReason:found?found.reason:("“"+query+"” so‘rovingizga "+item._tastepilotCategoryLabel.toLowerCase()+" yo‘nalishi orqali javob izlash uchun katalogdan topildi. Nomi asosida mosligi hali to‘liq tasdiqlanmagan — batafsil tekshirib ko‘rish kerak.")});});
  return res.json({demo:false,provider:"qloo",status:results.length?"results_found":"no_results",query,category:requestedCategory,categoryLabel:automatic?"Barcha mos yo‘nalishlar":categories[requestedCategory].label,automatic,resultCount:results.length,partialErrors:failed.length,explanationMode:explanations.length?"ai":"cautious_fallback",entities:results,results});
 }catch(error){console.error("Qloo discovery error:",error.name||"Error");return res.status(502).json({error:error.name==="TimeoutError"?"Qloo javobi kechikyapti. Qayta urinib ko‘ring.":error.message||"Qloo serveriga ulanib bo‘lmadi.",provider:"qloo",status:"error"});}
});
if(!process.env.VERCEL){const port=process.env.PORT||3000;app.listen(port,()=>console.log(`TastePilot running on http://localhost:${port}`))}
export default app;
