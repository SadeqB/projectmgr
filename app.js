const STORAGE_KEY = "project-time-manager-web-v1";
const SERVICE_WORKER_PATH = "service-worker.js";

const state = {
  projects: [],
  selectedProjectId: null,
  selectedSubprojectId: null,
  selectedTaskId: null,
  selectedItemId: null,
  recorder: null,
  recordingChunks: [],
};

const els = {
  addProjectButton: document.querySelector("#addProjectButton"),
  projectList: document.querySelector("#projectList"),
  emptyState: document.querySelector("#emptyState"),
  editor: document.querySelector("#editor"),
  projectTitle: document.querySelector("#projectTitle"),
  projectProgressText: document.querySelector("#projectProgressText"),
  projectProgressBar: document.querySelector("#projectProgressBar"),
  addSubprojectButton: document.querySelector("#addSubprojectButton"),
  addTaskButton: document.querySelector("#addTaskButton"),
  addItemButton: document.querySelector("#addItemButton"),
  detailKind: document.querySelector("#detailKind"),
  detailTitle: document.querySelector("#detailTitle"),
  deleteSelectedButton: document.querySelector("#deleteSelectedButton"),
  detailWeight: document.querySelector("#detailWeight"),
  doneGroup: document.querySelector("#doneGroup"),
  itemDone: document.querySelector("#itemDone"),
  timerGroup: document.querySelector("#timerGroup"),
  timerText: document.querySelector("#timerText"),
  startStopTimerButton: document.querySelector("#startStopTimerButton"),
  resetTimerButton: document.querySelector("#resetTimerButton"),
  detailDescription: document.querySelector("#detailDescription"),
  photoInput: document.querySelector("#photoInput"),
  photoList: document.querySelector("#photoList"),
  recordButton: document.querySelector("#recordButton"),
  voiceList: document.querySelector("#voiceList"),
};

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function blankNotes() {
  return { description: "", photos: [], voiceRecordings: [] };
}

function newProject(number) {
  return { id: id(), title: number ? `New Project ${number}` : "New Project", notes: blankNotes(), subprojects: [] };
}

function newSubproject(number) {
  return { id: id(), title: `Subproject ${number}`, weight: 0, notes: blankNotes(), tasks: [] };
}

function newTask(number) {
  return { id: id(), title: `Task ${number}`, weight: 0, notes: blankNotes(), items: [] };
}

function newItem(number) {
  return {
    id: id(),
    title: `Item ${number}`,
    weight: 0,
    isDone: false,
    notes: blankNotes(),
    elapsedSeconds: 0,
    timerStartedAt: null,
  };
}

function load() {
  try {
    state.projects = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    state.projects = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
}

function findProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId) || null;
}

function findSubproject() {
  return findProject()?.subprojects.find((subproject) => subproject.id === state.selectedSubprojectId) || null;
}

function findTask() {
  return findSubproject()?.tasks.find((task) => task.id === state.selectedTaskId) || null;
}

function findItem() {
  return findTask()?.items.find((item) => item.id === state.selectedItemId) || null;
}

function activeDetail() {
  const item = findItem();
  if (item) return { kind: "Item", value: item, collection: findTask().items };
  const task = findTask();
  if (task) return { kind: "Task", value: task, collection: findSubproject().tasks };
  const subproject = findSubproject();
  if (subproject) return { kind: "Subproject", value: subproject, collection: findProject().subprojects };
  const project = findProject();
  if (project) return { kind: "Project", value: project, collection: state.projects };
  return null;
}

function normalizedWeights(count, total = 100) {
  if (!count) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function normalize(collection) {
  const weights = normalizedWeights(collection.length);
  collection.forEach((entry, index) => {
    entry.weight = weights[index];
  });
}

function setWeight(collection, index, value) {
  if (index < 0) return;
  if (collection.length === 1) {
    collection[index].weight = 100;
    return;
  }

  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  collection[index].weight = clamped;
  const others = collection.map((_, otherIndex) => otherIndex).filter((otherIndex) => otherIndex !== index);
  const otherTotal = others.reduce((sum, otherIndex) => sum + collection[otherIndex].weight, 0);
  const remaining = 100 - clamped;

  if (!otherTotal) {
    const weights = normalizedWeights(others.length, remaining);
    others.forEach((otherIndex, offset) => {
      collection[otherIndex].weight = weights[offset];
    });
    return;
  }

  let used = 0;
  others.slice(0, -1).forEach((otherIndex) => {
    const scaled = Math.round((collection[otherIndex].weight * remaining) / otherTotal);
    collection[otherIndex].weight = Math.max(0, Math.min(100, scaled));
    used += collection[otherIndex].weight;
  });
  collection[others[others.length - 1]].weight = Math.max(0, Math.min(100, remaining - used));
}

function itemElapsed(item) {
  const running = item.timerStartedAt ? (Date.now() - item.timerStartedAt) / 1000 : 0;
  return item.elapsedSeconds + running;
}

function itemProgress(item) {
  return item.isDone ? item.weight : 0;
}

function taskProgress(task) {
  return task.items.reduce((sum, item) => sum + itemProgress(item), 0);
}

function subprojectProgress(subproject) {
  return subproject.tasks.reduce((sum, task) => sum + (task.weight * taskProgress(task)) / 100, 0);
}

function projectProgress(project) {
  return project.subprojects.reduce((sum, subproject) => sum + (subproject.weight * subprojectProgress(subproject)) / 100, 0);
}

function formatTime(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60).toString().padStart(2, "0");
  const secs = (rounded % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

function render() {
  const hasProjects = state.projects.length > 0;
  const project = findProject();
  els.emptyState.classList.toggle("hidden", hasProjects);
  els.editor.classList.toggle("hidden", !hasProjects);
  renderProjects();
  if (!hasProjects) return;
  renderProject(project);
  renderDetail();
}

function renderProjects() {
  els.projectList.innerHTML = "";
  state.projects.forEach((project) => {
    els.projectList.append(projectNode(project));
  });
}

function renderProject(project) {
  const progress = project ? projectProgress(project) : 0;
  els.projectTitle.value = project?.title || "";
  els.projectTitle.placeholder = project ? "Project title" : "Click a project to open it";
  els.projectTitle.disabled = !project;
  els.projectProgressText.textContent = `${Math.round(progress)}%`;
  els.projectProgressBar.style.width = `${progress}%`;
}

function renderDetail() {
  const detail = activeDetail();
  if (!detail) {
    els.detailKind.textContent = "Details";
    els.detailTitle.value = "";
    els.detailWeight.value = "";
    els.detailDescription.value = "";
    els.deleteSelectedButton.disabled = true;
    els.detailWeight.disabled = true;
    els.addSubprojectButton.disabled = true;
    els.addTaskButton.disabled = true;
    els.addItemButton.disabled = true;
    els.doneGroup.classList.add("hidden");
    els.timerGroup.classList.add("hidden");
    renderPhotos(blankNotes());
    renderVoiceNotes(blankNotes());
    return;
  }
  const { kind, value } = detail;
  const isProject = kind === "Project";
  const isItem = kind === "Item";

  els.detailKind.textContent = kind;
  els.detailTitle.value = value.title;
  els.deleteSelectedButton.disabled = isProject && state.projects.length === 1;
  els.detailWeight.disabled = isProject;
  els.detailWeight.value = isProject ? 100 : value.weight;
  els.detailDescription.value = value.notes.description || "";
  els.doneGroup.classList.toggle("hidden", !isItem);
  els.timerGroup.classList.toggle("hidden", !isItem);
  els.addSubprojectButton.disabled = !findProject();
  els.addTaskButton.disabled = !findSubproject();
  els.addItemButton.disabled = !findTask();

  if (isItem) {
    els.itemDone.checked = value.isDone;
    els.timerText.textContent = formatTime(itemElapsed(value));
    els.startStopTimerButton.textContent = value.timerStartedAt ? "Stop" : "Start";
  }

  renderPhotos(value.notes);
  renderVoiceNotes(value.notes);
}

function projectNode(project) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  const isOpen = project.id === state.selectedProjectId;
  wrapper.append(treeButton({
    title: project.title,
    meta: `${project.subprojects.length} subprojects`,
    progress: projectProgress(project),
    depth: 0,
    open: isOpen,
    active: isOpen && !state.selectedSubprojectId,
    onClick: () => {
      if (isOpen && !state.selectedSubprojectId && !state.selectedTaskId && !state.selectedItemId) {
        state.selectedProjectId = null;
      } else {
        state.selectedProjectId = project.id;
      }
      state.selectedSubprojectId = null;
      state.selectedTaskId = null;
      state.selectedItemId = null;
      render();
    },
  }));

  if (isOpen) {
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!project.subprojects.length) {
      children.append(emptyLine("No subprojects yet."));
    }
    project.subprojects.forEach((subproject) => children.append(subprojectNode(subproject)));
    wrapper.append(children);
  }

  return wrapper;
}

function subprojectNode(subproject) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  const isOpen = subproject.id === state.selectedSubprojectId;
  wrapper.append(treeButton({
    title: subproject.title,
    meta: `${subproject.weight}% share | ${subproject.tasks.length} tasks`,
    progress: subprojectProgress(subproject),
    depth: 1,
    open: isOpen,
    active: isOpen && !state.selectedTaskId,
    onClick: () => {
      state.selectedSubprojectId = isOpen ? null : subproject.id;
      state.selectedTaskId = null;
      state.selectedItemId = null;
      render();
    },
  }));

  if (isOpen) {
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!subproject.tasks.length) {
      children.append(emptyLine("No tasks yet."));
    }
    subproject.tasks.forEach((task) => children.append(taskNode(task)));
    wrapper.append(children);
  }

  return wrapper;
}

function taskNode(task) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  const isOpen = task.id === state.selectedTaskId;
  wrapper.append(treeButton({
    title: task.title,
    meta: `${task.weight}% share | ${task.items.length} items`,
    progress: taskProgress(task),
    depth: 2,
    open: isOpen,
    active: isOpen && !state.selectedItemId,
    onClick: () => {
      state.selectedTaskId = isOpen ? null : task.id;
      state.selectedItemId = null;
      render();
    },
  }));

  if (isOpen) {
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!task.items.length) {
      children.append(emptyLine("No items yet."));
    }
    task.items.forEach((item) => children.append(itemNode(item)));
    wrapper.append(children);
  }

  return wrapper;
}

function itemNode(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  const isOpen = item.id === state.selectedItemId;
  wrapper.append(treeButton({
    title: `${item.isDone ? "Done: " : ""}${item.title}`,
    meta: `${item.weight}% share | ${formatTime(itemElapsed(item))}`,
    progress: itemProgress(item),
    depth: 3,
    open: isOpen,
    active: isOpen,
    onClick: () => {
      state.selectedItemId = isOpen ? null : item.id;
      render();
    },
  }));

  if (isOpen) {
    const description = document.createElement("div");
    description.className = "item-description";
    description.textContent = item.notes.description || "No description yet.";
    wrapper.append(description);
  }

  return wrapper;
}

function treeButton({ title, meta, progress, depth, open, active, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tree-button depth-${depth}`;
  button.classList.toggle("active", active);
  button.innerHTML = `
    <div class="tree-title"><span class="chevron">${open ? "-" : "+"}</span><span class="title-text"></span><strong>${Math.round(progress)}%</strong></div>
    <div class="progress-bar"><div style="width: ${progress}%"></div></div>
    <div class="tree-meta"></div>
  `;
  button.querySelector(".title-text").textContent = title;
  button.querySelector(".tree-meta").textContent = meta;
  button.addEventListener("click", onClick);
  return button;
}

function emptyLine(text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  return p;
}

function renderPhotos(notes) {
  els.photoList.innerHTML = "";
  if (!notes.photos.length) {
    els.photoList.append(emptyLine("No photos attached."));
    return;
  }
  notes.photos.forEach((photo) => {
    const tile = document.createElement("div");
    tile.className = "photo-tile";
    const img = document.createElement("img");
    img.src = photo.dataUrl;
    img.alt = photo.name || "Attached photo";
    tile.append(img);
    els.photoList.append(tile);
  });
}

function renderVoiceNotes(notes) {
  els.voiceList.innerHTML = "";
  if (!notes.voiceRecordings.length) {
    els.voiceList.append(emptyLine("No voice notes recorded."));
    return;
  }
  notes.voiceRecordings.forEach((recording) => {
    const row = document.createElement("div");
    row.className = "voice-row";
    const label = document.createElement("span");
    label.textContent = new Date(recording.createdAt).toLocaleString();
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = recording.dataUrl;
    row.append(label, audio);
    els.voiceList.append(row);
  });
}

function selectedNotes() {
  return activeDetail()?.value.notes || null;
}

function updateDetail(callback) {
  const detail = activeDetail();
  if (!detail) return;
  callback(detail.value, detail);
  save();
  render();
}

els.addProjectButton.addEventListener("click", () => {
  const project = newProject(state.projects.length ? state.projects.length + 1 : 0);
  state.projects.push(project);
  state.selectedProjectId = project.id;
  state.selectedSubprojectId = null;
  state.selectedTaskId = null;
  state.selectedItemId = null;
  save();
  render();
});

els.projectTitle.addEventListener("input", () => {
  const project = findProject();
  if (!project) return;
  project.title = els.projectTitle.value;
  save();
  renderProjects();
  renderDetail();
});

els.addSubprojectButton.addEventListener("click", () => {
  const project = findProject();
  if (!project) return;
  const subproject = newSubproject(project.subprojects.length + 1);
  project.subprojects.push(subproject);
  normalize(project.subprojects);
  state.selectedSubprojectId = subproject.id;
  state.selectedTaskId = null;
  state.selectedItemId = null;
  save();
  render();
});

els.addTaskButton.addEventListener("click", () => {
  const subproject = findSubproject();
  if (!subproject) return;
  const task = newTask(subproject.tasks.length + 1);
  subproject.tasks.push(task);
  normalize(subproject.tasks);
  state.selectedTaskId = task.id;
  state.selectedItemId = null;
  save();
  render();
});

els.addItemButton.addEventListener("click", () => {
  const task = findTask();
  if (!task) return;
  const item = newItem(task.items.length + 1);
  task.items.push(item);
  normalize(task.items);
  state.selectedItemId = item.id;
  save();
  render();
});

els.detailTitle.addEventListener("input", () => updateDetail((value) => {
  value.title = els.detailTitle.value;
}));

els.detailDescription.addEventListener("input", () => updateDetail((value) => {
  value.notes.description = els.detailDescription.value;
}));

els.detailWeight.addEventListener("change", () => {
  const detail = activeDetail();
  if (!detail || detail.kind === "Project") return;
  const index = detail.collection.findIndex((entry) => entry.id === detail.value.id);
  setWeight(detail.collection, index, els.detailWeight.value);
  save();
  render();
});

els.itemDone.addEventListener("change", () => updateDetail((value) => {
  value.isDone = els.itemDone.checked;
}));

els.startStopTimerButton.addEventListener("click", () => updateDetail((value) => {
  if (!value.timerStartedAt) {
    value.timerStartedAt = Date.now();
    return;
  }
  value.elapsedSeconds = itemElapsed(value);
  value.timerStartedAt = null;
}));

els.resetTimerButton.addEventListener("click", () => updateDetail((value) => {
  value.elapsedSeconds = 0;
  value.timerStartedAt = null;
}));

els.deleteSelectedButton.addEventListener("click", () => {
  const detail = activeDetail();
  if (!detail) return;
  const index = detail.collection.findIndex((entry) => entry.id === detail.value.id);
  if (index < 0) return;
  detail.collection.splice(index, 1);

  if (detail.kind === "Project") {
    state.selectedProjectId = state.projects[0]?.id || null;
    state.selectedSubprojectId = null;
    state.selectedTaskId = null;
    state.selectedItemId = null;
  } else if (detail.kind === "Subproject") {
    normalize(detail.collection);
    state.selectedSubprojectId = null;
    state.selectedTaskId = null;
    state.selectedItemId = null;
  } else if (detail.kind === "Task") {
    normalize(detail.collection);
    state.selectedTaskId = null;
    state.selectedItemId = null;
  } else {
    normalize(detail.collection);
    state.selectedItemId = null;
  }

  save();
  render();
});

els.photoInput.addEventListener("change", async () => {
  const notes = selectedNotes();
  if (!notes) return;
  const files = Array.from(els.photoInput.files || []);
  for (const file of files) {
    notes.photos.push({
      id: id(),
      name: file.name,
      createdAt: new Date().toISOString(),
      dataUrl: await fileToDataURL(file),
    });
  }
  els.photoInput.value = "";
  save();
  render();
});

els.recordButton.addEventListener("click", async () => {
  if (state.recorder?.state === "recording") {
    state.recorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    alert("Voice recording is not supported in this browser.");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.recordingChunks = [];
  state.recorder = new MediaRecorder(stream);
  state.recorder.ondataavailable = (event) => state.recordingChunks.push(event.data);
  state.recorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());
    const notes = selectedNotes();
    if (!notes) return;
    const blob = new Blob(state.recordingChunks, { type: "audio/webm" });
    notes.voiceRecordings.push({
      id: id(),
      createdAt: new Date().toISOString(),
      dataUrl: await blobToDataURL(blob),
    });
    els.recordButton.textContent = "Record";
    save();
    render();
  };
  state.recorder.start();
  els.recordButton.textContent = "Stop";
});

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToDataURL(blob) {
  return fileToDataURL(blob);
}

setInterval(() => {
  const item = findItem();
  if (item?.timerStartedAt) {
    els.timerText.textContent = formatTime(itemElapsed(item));
    renderProjects();
    save();
  }
}, 1000);

window.addEventListener("beforeunload", save);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

load();
render();
