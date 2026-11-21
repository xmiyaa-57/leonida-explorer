(() => {
  "use strict";
  // Les tuiles sont hébergées localement dans le dépôt (copie du dossier GTADB).
  // Le nom des fichiers suit l'ordre z,x,y : 5,21,100.jpg.
  const TILE_ROOT = "./maps/tiles/6/yanis,18/";
  const STORAGE_KEY = "leonidaExplorer.v1";
  const DEFAULT_CATEGORIES = [
    { id:"repere", name:"Repères", color:"#e9a84d" },
    { id:"secret", name:"Secrets", color:"#c17de0" },
    { id:"activite", name:"Activités", color:"#5bb9a8" },
    { id:"autre", name:"Autre", color:"#75a8e8" }
  ];
  const $ = (id) => document.getElementById(id);
  let data = loadData();
  let activeCategory = "all";
  let adding = false;
  let editingId = null;
  let pendingPoint = null;
  let toastTimer = null;
  const markersById = new Map();

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.categories) && Array.isArray(saved.markers)) return saved;
    } catch (error) { console.warn("Impossible de lire les données locales", error); }
    return { categories: DEFAULT_CATEGORIES.map(x => ({...x})), markers: [] };
  }
  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      showToast("Sauvegarde impossible : espace de stockage indisponible.");
      return false;
    }
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }
  function categoryFor(id) { return data.categories.find(c => c.id === id) || data.categories[0]; }
  function showToast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600);
  }

  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: 5,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 80,
    maxBoundsViscosity: 0.85,
    attributionControl: true
  });
  // Emprise exacte de YANIS V18 au niveau 5 : x=21..103, y=21..99.
  // CRS.Simple : les coordonnées sont exprimées dans l'échelle du niveau 0.
  const TILE_SIZE = 256;
  const MAX_SOURCE_ZOOM = 5;
  const SOURCE_MIN_X = 21;
  const SOURCE_MAX_X = 103;
  const SOURCE_MIN_Y = 21;
  const SOURCE_MAX_Y = 99;
  const UNIT = TILE_SIZE / Math.pow(2, MAX_SOURCE_ZOOM);
  const mapBounds = L.latLngBounds(
    [-(SOURCE_MAX_Y + 1) * UNIT, SOURCE_MIN_X * UNIT],
    [-SOURCE_MIN_Y * UNIT, (SOURCE_MAX_X + 1) * UNIT]
  );
  L.tileLayer(TILE_ROOT + "{z}/{z},{y},{x}.jpg", {
    minZoom:0, maxZoom:5, tileSize:256, noWrap:true, bounds:mapBounds,
    keepBuffer:4, updateWhenZooming:false, updateWhenIdle:true,
    attribution:'Carte communautaire YANIS V18 · <a href="https://map.gtadb.org/" target="_blank" rel="noopener">GTADB.ORG</a> · CC BY 4.0'
  }).addTo(map);
  map.fitBounds(mapBounds, {padding:[18,18]});
  map.setMaxBounds(mapBounds.pad(0.08));

  function markerIcon(category) {
    return L.divIcon({
      className:"",
      html:'<div class="custom-pin" style="background:'+escapeHtml(category.color)+'"></div>',
      iconSize:[20,24], iconAnchor:[10,22], popupAnchor:[0,-20]
    });
  }
  function renderMarkers() {
    markersById.forEach(layer => map.removeLayer(layer));
    markersById.clear();
    data.markers.forEach(item => {
      const category = categoryFor(item.categoryId);
      const layer = L.marker([item.lat,item.lng], {icon:markerIcon(category), keyboard:true, title:item.title}).addTo(map);
      layer.on("click", () => openModal(item.id));
      markersById.set(item.id, layer);
    });
    renderSidebar();
  }
  function renderSidebar() {
    const query = $("searchInput").value.trim().toLocaleLowerCase("fr");
    const categories = data.categories;
    $("categoryList").innerHTML =
      '<label class="category-row '+(activeCategory==="all"?"active":"")+'"><input type="radio" name="category" value="all" '+(activeCategory==="all"?"checked":"")+'><span class="category-name">Toutes les catégories</span><span class="category-count">'+data.markers.length+'</span></label>' +
      categories.map(c => {
        const count = data.markers.filter(m => m.categoryId===c.id).length;
        return '<label class="category-row '+(activeCategory===c.id?"active":"")+'"><input type="radio" name="category" value="'+escapeHtml(c.id)+'" '+(activeCategory===c.id?"checked":"")+'><span class="category-color" style="background:'+escapeHtml(c.color)+'"></span><span class="category-name">'+escapeHtml(c.name)+'</span><span class="category-count">'+count+'</span></label>';
      }).join("");
    $("categoryList").querySelectorAll('input[name="category"]').forEach(input => input.addEventListener("change", () => {activeCategory=input.value;renderSidebar();}));
    const visible = data.markers.filter(m => (activeCategory==="all" || m.categoryId===activeCategory) && (m.title+" "+m.description).toLocaleLowerCase("fr").includes(query));
    $("markerCount").textContent = data.markers.length;
    $("visibleCount").textContent = visible.length;
    $("markerList").innerHTML = visible.length ? visible.map(m => {
      const c = categoryFor(m.categoryId);
      return '<article class="marker-card" data-id="'+escapeHtml(m.id)+'"><strong>'+escapeHtml(m.title)+'</strong><div class="marker-meta"><span class="category-color" style="background:'+escapeHtml(c.color)+'"></span><small>'+escapeHtml(c.name)+'</small></div></article>';
    }).join("") : '<div class="empty-list">'+(data.markers.length ? "Aucun résultat dans cette sélection." : "Aucun repère pour le moment.<br>Active « Ajouter un repère » puis clique sur la carte.")+'</div>';
    $("markerList").querySelectorAll(".marker-card").forEach(card => card.addEventListener("click", () => {
      const layer = markersById.get(card.dataset.id);
      if (layer) { map.flyTo(layer.getLatLng(), Math.max(map.getZoom(),3), {duration:.5}); openModal(card.dataset.id); }
    }));
  }
  function fillCategorySelect(selected) {
    $("markerCategory").innerHTML = data.categories.map(c => '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join("");
    if (selected && data.categories.some(c=>c.id===selected)) $("markerCategory").value=selected;
  }
  function openModal(id, point) {
    editingId = id || null;
    pendingPoint = point || null;
    const item = id ? data.markers.find(m=>m.id===id) : null;
    $("modalTitle").textContent = item ? "Modifier le repère" : "Nouveau repère";
    $("markerTitle").value = item ? item.title : "";
    $("markerDescription").value = item ? item.description : "";
    fillCategorySelect(item ? item.categoryId : (activeCategory!=="all" ? activeCategory : data.categories[0].id));
    $("deleteMarker").hidden = !item;
    $("modalBackdrop").hidden = false;
    $("markerTitle").focus();
  }
  function closeModal() {
    $("modalBackdrop").hidden = true;
    editingId = null;
    pendingPoint = null;
  }
  function setAddMode(value) {
    adding = value;
    document.body.classList.toggle("add-mode",adding);
    $("addMode").classList.toggle("primary",adding);
    $("addMode").textContent = adding ? "✕ Annuler l'ajout" : "＋ Ajouter un repère";
    $("mapHint").textContent = adding ? "Clique à l’endroit souhaité pour placer ton repère" : "Déplace-toi sur la carte · Molette pour zoomer";
    $("mapStatus").textContent = adding ? "Clique sur la carte pour placer un repère" : "Carte prête";
  }

  map.on("click", event => {
    if (!adding) return;
    setAddMode(false);
    openModal(null, event.latlng);
  });
  $("addMode").addEventListener("click", () => setAddMode(!adding));
  $("closeModal").addEventListener("click", closeModal);
  $("cancelModal").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", e => { if(e.target===$("modalBackdrop")) closeModal(); });
  $("markerForm").addEventListener("submit", event => {
    event.preventDefault();
    const title = $("markerTitle").value.trim();
    if (!title) return;
    const item = editingId ? data.markers.find(m=>m.id===editingId) : null;
    if (item) {
      item.title=title;
      item.description=$("markerDescription").value.trim();
      item.categoryId=$("markerCategory").value;
    } else if (pendingPoint) {
      data.markers.push({
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2)),
        title, description:$("markerDescription").value.trim(),
        categoryId:$("markerCategory").value,
        lat:pendingPoint.lat, lng:pendingPoint.lng,
        createdAt:new Date().toISOString()
      });
    }
    saveData(); closeModal(); renderMarkers(); showToast(item ? "Repère mis à jour." : "Repère ajouté à ta carte.");
  });
  $("deleteMarker").addEventListener("click", () => {
    if (!editingId) return;
    if (!confirm("Supprimer définitivement ce repère ?")) return;
    data.markers=data.markers.filter(m=>m.id!==editingId);
    saveData(); closeModal(); renderMarkers(); showToast("Repère supprimé.");
  });
  $("addCategoryBtn").addEventListener("click", () => {
    const name=prompt("Nom de la nouvelle catégorie :");
    if (!name || !name.trim()) return;
    if (data.categories.some(c=>c.name.toLocaleLowerCase("fr")===name.trim().toLocaleLowerCase("fr"))) {showToast("Cette catégorie existe déjà.");return;}
    const palette=["#e9a84d","#c17de0","#5bb9a8","#75a8e8","#e17b82","#a4b86a","#d28d59","#7fa6a1"];
    const color=prompt("Couleur hexadécimale (ex. #e9a84d) :",palette[data.categories.length%palette.length]) || palette[data.categories.length%palette.length];
    const safeColor=/^#[0-9a-fA-F]{6}$/.test(color)?color:palette[data.categories.length%palette.length];
    const id="cat-"+Date.now().toString(36);
    data.categories.push({id,name:name.trim().slice(0,30),color:safeColor});
    activeCategory=id; saveData(); renderSidebar(); showToast("Catégorie créée.");
  });
  $("searchInput").addEventListener("input",renderSidebar);
  $("resetView").addEventListener("click",()=>map.fitBounds(mapBounds,{padding:[18,18],animate:true}));
  $("exportBtn").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify({app:"Leonida Explorer",version:1,...data},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download="leonida-explorer-backup.json";a.click();URL.revokeObjectURL(url);showToast("Sauvegarde exportée.");
  });
  $("importBtn").addEventListener("click",()=>$("importFile").click());
  $("importFile").addEventListener("change",async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      const imported=JSON.parse(await file.text());
      if(!Array.isArray(imported.categories)||!Array.isArray(imported.markers))throw new Error("Format invalide");
      if(!confirm("Importer cette sauvegarde et remplacer les données présentes dans ce navigateur ?"))return;
      data={categories:imported.categories.filter(c=>c&&c.id&&c.name&&/^#[0-9a-fA-F]{6}$/.test(c.color)),markers:imported.markers.filter(m=>m&&m.id&&m.title&&Number.isFinite(m.lat)&&Number.isFinite(m.lng))};
      saveData();renderMarkers();showToast("Sauvegarde importée.");
    }catch(error){showToast("Fichier invalide ou illisible.");}
    finally{event.target.value="";}
  });
  renderMarkers();
  setTimeout(()=>map.invalidateSize(),150);
  window.addEventListener("resize",()=>map.invalidateSize());
})();