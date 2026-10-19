(()=> {
 const button=document.getElementById("tpLiveVoice"),label=document.getElementById("tpLiveVoiceLabel"),state=document.getElementById("tpLiveVoiceState"),thinking=document.getElementById("tpLiveThinking");
 if(!button||!label||!state)return;
 let socket=null,stream=null,context=null,processor=null,source=null,active=false,starting=false,ready=false,nextPlayAt=0;
 const status=(s)=>state.textContent=s;
 const stop=async(msg)=>{active=false;starting=false;ready=false;button.disabled=false;button.setAttribute("aria-pressed","false");button.classList.remove("is-listening");label.textContent="Start live voice";try{if(processor){processor.disconnect();processor.onaudioprocess=null}}catch{}processor=null;try{source?.disconnect()}catch{}source=null;stream?.getTracks().forEach(t=>t.stop());stream=null;try{socket&&(socket.onclose=null,socket.close())}catch{}socket=null;try{await context?.close()}catch{}context=null;nextPlayAt=0;status(msg)};
 const bytes64=(s)=>{const x=atob(s),b=new Uint8Array(x.length);for(let i=0;i<x.length;i++)b[i]=x.charCodeAt(i);return b};
 const b64=(b)=>{let s="";for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,Math.min(i+32768,b.length)));return btoa(s)};
 function audio64(samples,rate){const ratio=rate/16000,len=Math.floor(samples.length/ratio),out=new ArrayBuffer(len*2),v=new DataView(out);for(let i=0;i<len;i++){let a=Math.floor(i*ratio),z=Math.min(Math.floor((i+1)*ratio),samples.length),sum=0,n=0;for(let j=a;j<z;j++){sum+=samples[j];n++}let f=Math.max(-1,Math.min(1,n?sum/n:0));v.setInt16(i*2,f<0?f*32768:f*32767,true)}return b64(new Uint8Array(out))}
 function play(data,mime){if(!context)return;const raw=bytes64(data);if(raw.byteLength%2)return;const pcm=new Int16Array(raw.buffer,raw.byteOffset,raw.byteLength/2),m=String(mime||"").match(/rate=(\d+)/),rate=m?Number(m[1]):24000,buf=context.createBuffer(1,pcm.length,rate),ch=buf.getChannelData(0);for(let i=0;i<pcm.length;i++)ch[i]=pcm[i]/32768;const node=context.createBufferSource();node.buffer=buf;node.connect(context.destination);nextPlayAt=Math.max(context.currentTime+.02,nextPlayAt);node.start(nextPlayAt);nextPlayAt+=buf.duration;node.onended=()=>{try{node.disconnect()}catch{}}}
 function send(samples){if(!ready||socket?.readyState!==WebSocket.OPEN)return;socket.send(JSON.stringify({realtimeInput:{audio:{mimeType:"audio/pcm;rate=16000",data:audio64(samples,context.sampleRate)}}}))}
 async function start(){
  if(active||starting){await stop("Live voice stopped.");return}
  if(!navigator.mediaDevices?.getUserMedia||!window.WebSocket){status("Live voice is not supported here. Use Chrome/Edge or the regular voice button.");return}
  starting=true;button.disabled=true;status("Requesting microphone permission…");
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   context=new(window.AudioContext||window.webkitAudioContext)({sampleRate:24000});await context.resume();
   const r=await fetch("/api/voice-token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:thinking?.checked?"thinking":"live",language:document.documentElement.lang||"en"})});
   const d=await r.json();if(!r.ok||!d.token)throw Error(d.error||"Could not create voice session.");
   socket=new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?access_token="+encodeURIComponent(d.token));
   socket.onopen=()=>{const setup={setup:{model:d.model.startsWith("models/")?d.model:"models/"+d.model,generationConfig:{responseModalities:["AUDIO"]}}};if(d.mode==="thinking")setup.setup.generationConfig.thinkingConfig={thinkingLevel:"medium"};socket.send(JSON.stringify(setup))};
   socket.onmessage=async(e)=>{let p;try{p=JSON.parse(e.data)}catch{return}
    if(p.setupComplete){ready=true;active=true;starting=false;button.disabled=false;button.setAttribute("aria-pressed","true");button.classList.add("is-listening");label.textContent="Stop live voice";status("Connected. Speak naturally; tap Stop live voice when finished.");try{source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(2048,1,1);processor.onaudioprocess=e=>{if(active)send(e.inputBuffer.getChannelData(0))};source.connect(processor);processor.connect(context.destination)}catch(err){await stop("Microphone stream could not start.")}}
    for(const part of (p.serverContent?.modelTurn?.parts||[])){const x=part.inlineData||part.inline_data;if(x?.data&&String(x.mimeType||x.mime_type||"").includes("audio/pcm"))play(x.data,x.mimeType||x.mime_type)}
    if(p.serverContent?.interrupted)nextPlayAt=context?.currentTime||0;
    if(p.error)await stop("Gemini Live returned an error. Normal chat is still available.");
   };
   socket.onerror=()=>{if(starting||active)stop("Live voice connection failed. Check model access and try again.")};
   socket.onclose=()=>{if(starting||active)stop("Live voice session ended. Normal chat is still available.")};
  }catch(e){await stop(e?.message||"Could not start Live voice. Normal chat remains available.")}
  finally{button.disabled=false}
 }
 button.addEventListener("click",start);
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&(active||starting))stop("Live voice stopped because this tab was hidden.")});
 window.addEventListener("beforeunload",()=>{try{stream?.getTracks().forEach(t=>t.stop());socket?.close();context?.close()}catch{}});
})();