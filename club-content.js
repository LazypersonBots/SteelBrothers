/* Non-sensitive, approved editorial data only. No club facts are fabricated. */
(() => {
  const pick = selector => document.querySelector(selector);
  const element = (tag,cls,value) => {
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=value;
    return node;
  };
  const safeText = (value,max=2500) =>
    typeof value==='string'&&value.trim().length>0&&value.trim().length<=max
      ? value.trim():null;
  function officialVideo(url) {
    if(typeof url!=='string')return null;
    try {
      const parsed=new URL(url);
      if(parsed.protocol!=='https:'||parsed.username||parsed.password)return null;
      const name=parsed.hostname.toLowerCase();
      if(['youtube.com','www.youtube.com','youtu.be','www.youtu.be','vimeo.com','www.vimeo.com'].includes(name))
        return parsed.href;
    }catch{}
    return null;
  }
  let savedContent=null;
  const english=()=>globalThis.window?.SteelI18n?.lang==='en';
  const localized=(item,key,max=1000)=>{
    if(!item||typeof item!=='object')return null;
    return (english() && safeText(item[key+'En'],max))||safeText(item[key],max);
  };
  function renderEditable(content) {
    savedContent=content;
    const history=pick('[data-club-history]');
    const approvedHistory=(english()&&safeText(content.historyEn,4000))||safeText(content.history,4000);
    if(history&&approvedHistory)history.textContent=approvedHistory;

    const chapters=pick('[data-club-chapters]');
    const chapterNames=Array.isArray(content.chapters)
      ?content.chapters.map(c=>typeof c==='string'?safeText(c,120):c?.approved===true?localized(c,'name',120):null).filter(Boolean):[];
    if(chapters&&chapterNames.length){
      const previous=chapters.querySelector?.('.club-chapters-list');
      if(previous)previous.remove();
      const list=element('ul','club-chapters-list');
      for(const chapter of chapterNames)list.append(element('li','',chapter));
      chapters.append(list);chapters.hidden=false;
    }
    const contact=pick('[data-public-contact]');
    if(contact){
      const entries=[];
      const details=content.contact||{};
      const email=safeText(details.email,254);
      if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        const link=element('a','club-contact-link',email);
        link.href='mailto:'+email;entries.push(link);
      }
      const phone=safeText(details.phone,35);
      if(phone&&/^\+?[0-9 ()-]{6,35}$/.test(phone)){
        const link=element('a','club-contact-link',phone);
        link.href='tel:'+phone.replace(/[^0-9+]/g,'');entries.push(link);
      }
      const address=localized(details,'address',250);
      if(address)entries.push(element('p','',address));
      const clubhouse=localized(details,'publicClubhouse',400);
      if(clubhouse)entries.push(element('p','',clubhouse));
      if(entries.length)contact.replaceChildren(...entries);
    }

    const merch=pick('[data-merch-list]');
    const products=Array.isArray(content.merch)
      ?content.merch.filter(entry=>entry&&entry.approved===true&&
        safeText(entry.title,120)&&safeText(entry.description,400)):[];
    if(merch&&products.length){
      merch.replaceChildren();
      for(const entry of products){
        const card=element('article','club-merch-card');
        card.append(element('h3','',localized(entry,'title',120)||entry.title.trim()),
          element('p','',localized(entry,'description',400)||entry.description.trim()));
        merch.append(card);
      }
      merch.hidden=false;
      const pending=pick('[data-merch-pending]');
      if(pending)pending.hidden=true;
    }

    const memory=pick('[data-memorials]');
    const tributes=Array.isArray(content.memorials)
      ?content.memorials.filter(entry=>entry&&entry.approved===true&&
        safeText(entry.name,100)&&safeText(entry.tribute,600)):[];
    if(memory&&tributes.length){
      const list=pick('[data-memorial-list]');
      if(list){
        list.replaceChildren();
        for(const person of tributes){
          const card=element('article','club-memory-entry');
          card.append(element('h3','',localized(person,'name',100)||person.name.trim()),
            element('p','',localized(person,'tribute',600)||person.tribute.trim()));
          list.append(card);
        }
      }
      memory.hidden=false;
    }
    const hours=pick('[data-club-hours]');
    const opening=content.clubhouse?.openingHours;
    if(hours&&content.clubhouse?.approved===true&&Array.isArray(opening)){
      const approved=opening.filter(entry=>entry&&safeText(entry.day,50)&&safeText(entry.hours,100));
      if(approved.length){
        const list=element('ul','club-hours-list');
        for(const entry of approved){
          const row=element('li','');
          row.append(element('strong','',localized(entry,'day',50)||entry.day),
            element('span','',localized(entry,'hours',100)||entry.hours));
          list.append(row);
        }
        hours.replaceChildren(list);
      }
    }
    const socials=pick('[data-club-socials]');
    const allowedHosts=new Set(['instagram.com','www.instagram.com','facebook.com','www.facebook.com',
      'youtube.com','www.youtube.com','youtu.be','tiktok.com','www.tiktok.com',
      'x.com','www.x.com','twitter.com','www.twitter.com','threads.net','www.threads.net',
      'discord.gg','discord.com','www.discord.com']);
    const approvedSocials=Array.isArray(content.socials)?content.socials.filter(entry=>entry&&
      entry.approved===true&&safeText(entry.platform,40)&&safeText(entry.url,500)):[];
    if(socials){
      const links=[];
      for(const entry of approvedSocials){
        try{
          const url=new URL(entry.url);
          if(url.protocol!=='https:'||url.username||url.password||!allowedHosts.has(url.hostname.toLowerCase()))continue;
          const link=element('a','club-contact-link',entry.platform);
          link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
          links.push(link);
        }catch{}
      }
      if(links.length)socials.replaceChildren(...links);
    }

    const videoGrid=pick('[data-approved-videos]');
    const videos=Array.isArray(content.videos)
      ?content.videos.filter(entry=>entry&&entry.approved===true&&
        safeText(entry.title,150)&&officialVideo(entry.url)):[];
    if(videoGrid&&videos.length){
      const cards=videos.map(entry=>{
        const link=element('a','club-video-link',(localized(entry,'title',150)||entry.title.trim())+' ↗');
        link.href=officialVideo(entry.url);
        link.target='_blank';link.rel='noopener noreferrer';
        const article=element('article','club-video-card');
        article.append(element('span','eyebrow accent',' / SCHVÁLENÉ VIDEO'),link);
        const description=safeText(entry.description,300);
        if(description)article.append(element('p','',localized(entry,'description',300)||description));
        return article;
      });
      videoGrid.replaceChildren(...cards);
    }
  }

  async function loadContent(){
    try{
      const response=await fetch('/club-content.json',{cache:'no-store'});
      if(!response.ok)throw Error('Approved content unavailable');
      const content=await response.json();
      if(content&&typeof content==='object'&&!Array.isArray(content))renderEditable(content);
    }catch{
      // Editorial placeholders remain truthful when offline.
    }
  }
  async function loadNews(){
    const news=pick('[data-club-news]');
    if(!news)return;
    try{
      const response=await fetch('/api/announcements',{cache:'no-store'});
      if(!response.ok)throw Error('Announcements unavailable');
      const data=await response.json();
      if(data.available===false){
        news.textContent='Aktuality klubu se nyní připravují.';
        return;
      }
      const items=Array.isArray(data.announcements)?data.announcements:[];
      const current=items.find(item=>safeText(item.title,120)&&safeText(item.body,3000));
      if(!current){news.textContent='Zatím nebylo zveřejněno žádné klubové oznámení.';return;}
      const card=element('article','club-news-item');
      card.append(element('h3','',current.title.trim()));
      const excerpt=current.body.trim();
      card.append(element('p','',excerpt.length>180?excerpt.slice(0,177)+'…':excerpt));
      news.replaceChildren(card);
    }catch{
      news.textContent='Aktuality jsou dočasně nedostupné. Zkus to později.';
    }
  }

  const openBell=pick('[data-open-announcements]');
  if(openBell)openBell.addEventListener('click',()=>{
    const bell=document.getElementById('sb-bell');
    if(bell)bell.click();
  });
  document.addEventListener('sb:language-change',()=>{
    if(savedContent)renderEditable(savedContent);
    void loadNews();
  });
  void loadContent();
  void loadNews();
})();
