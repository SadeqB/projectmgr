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
  subprojectList: document.querySelector("#subprojectList"),
  taskList: document.querySelector("#taskList"),
  itemList: document.querySelector("#itemList"),
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
  state.selectedProjectId = state.projects[0]?.id || null;
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
  const project = findProject();
  els.emptyState.classList.toggle("hidden", Boolean(project));
  els.editor.classList.toggle("hidden", !project);
  renderProjects();
  if (!project) return;
  renderProject(project);
  renderSubprojects(project);
  renderTasks();
  renderItems();
  renderDetail();
}

function renderProjects() {
  els.projectList.innerHTML = "";
  state.projects.forEach((project) => {
    const button = cardButton(project.title, `${project.subprojects.length} subprojects`, projectProgress(project));
    button.classList.toggle("active", project.id === state.selectedProjectId);
    button.addEventListener("click", () => {
      state.selectedProjectId = project.id;
      state.selectedSubprojectId = null;
      state.selectedTaskId = null;
      state.selectedItemId = null;
      render();
    });
    els.projectList.append(button);
  });
}

function renderProject(project) {
  const progress = projectProgress(project);
  els.projectTitle.value = project.title;
  els.projectProgressText.textContent = `${Math.round(progress)}%`;
  els.projectProgressBar.style.width = `${progress}%`;
}

function renderSubprojects(project) {
  els.subprojectList.innerHTML = "";
  if (!project.subprojects.length) {
    els.subprojectList.append(emptyLine("Add a subproject."));
    return;
  }
  project.subprojects.forEach((subproject) => {
    const button = cardButton(subproject.title, `${subproject.weight}% share`, subprojectProgress(subproject));
    button.classList.toggle("active", subproject.id === state.selectedSubprojectId);
    button.addEventListener("click", () => {
      state.selectedSubprojectId = subproject.id;
      state.selectedTaskId = null;
      state.selectedItemId = null;
      render();
    });
    els.subprojectList.append(button);
  });
}

function renderTasks() {
  const subproject = findSubproject();
  els.taskList.innerHTML = "";
  if (!subproject) {
    els.taskList.append(emptyLine("Select a subproject."));
    return;
  }
  if (!subproject.tasks.length) {
    els.taskList.append(emptyLine("Add a task."));
    return;
  }
  subproject.tasks.forEach((task) => {
    const button = cardButton(task.title, `${task.weight}% share`, taskProgress(task));
    button.classList.toggle("active", task.id === state.selectedTaskId);
    button.addEventListener("click", () => {
      state.selectedTaskId = task.id;
      state.selectedItemId = null;
      render();
    });
    els.taskList.append(button);
  });
}

function renderItems() {
  const task = findTask();
  els.itemList.innerHTML = "";
  if (!task) {
    els.itemList.append(emptyLine("Select a task."));
    return;
  }
  if (!task.items.length) {
    els.itemList.append(emptyLine("Add an item."));
    return;
  }
  task.items.forEach((item) => {
    const button = cardButton(`${item.isDone ? "✓ " : ""}${item.title}`, `${item.weight}% share · ${formatTime(itemElapsed(item))}`, itemProgress(item));
    button.classList.toggle("active", item.id === state.selectedItemId);
    button.addEventListener("click", () => {
      state.selectedItemId = item.id;
      render();
    });
    els.itemList.append(button);
  });
}

function renderDetail() {
  const detail = activeDetail();
  if (!detail) return;
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

  if (isItem) {
    els.itemDone.checked = value.isDone;
    els.timerText.textContent = formatTime(itemElapsed(value));
    els.startStopTimerButton.textContent = value.timerStartedAt ? "Stop" : "Start";
  }

  renderPhotos(value.notes);
  renderVoiceNotes(value.notes);
}

function cardButton(title, meta, progress) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card-button";
  button.innerHTML = `
    <div class="card-title"><span></span><strong>${Math.round(progress)}%</strong></div>
    <div class="progress-bar"><div style="width: ${progress}%"></div></div>
    <div class="card-meta"></div>
  `;
  button.querySelector("span").textContent = title;
  button.querySelector(".card-meta").textContent = meta;
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
    renderItems();
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
