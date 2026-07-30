const STORAGE_KEY = "project-time-manager-web-v2";
const OLD_STORAGE_KEY = "project-time-manager-web-v1";
const SERVICE_WORKER_PATH = "service-worker.js";

const state = {
  projects: [],
  openProjectIds: new Set(),
  openTaskIds: new Set(),
  openItemIds: new Set(),
  form: null,
  recorder: null,
  recordingChunks: [],
};

const els = {
  addProjectButton: document.querySelector("#addProjectButton"),
  emptyState: document.querySelector("#emptyState"),
  listView: document.querySelector("#listView"),
  projectList: document.querySelector("#projectList"),
  formView: document.querySelector("#formView"),
  objectForm: document.querySelector("#objectForm"),
  formKind: document.querySelector("#formKind"),
  formHeading: document.querySelector("#formHeading"),
  formTitle: document.querySelector("#formTitle"),
  weightGroup: document.querySelector("#weightGroup"),
  formWeight: document.querySelector("#formWeight"),
  doneGroup: document.querySelector("#doneGroup"),
  formDone: document.querySelector("#formDone"),
  currentProgressGroup: document.querySelector("#currentProgressGroup"),
  formCurrentProgress: document.querySelector("#formCurrentProgress"),
  maxProgressGroup: document.querySelector("#maxProgressGroup"),
  formMaxProgress: document.querySelector("#formMaxProgress"),
  timerGroup: document.querySelector("#timerGroup"),
  timerText: document.querySelector("#timerText"),
  startStopTimerButton: document.querySelector("#startStopTimerButton"),
  resetTimerButton: document.querySelector("#resetTimerButton"),
  formDescription: document.querySelector("#formDescription"),
  photoInput: document.querySelector("#photoInput"),
  photoList: document.querySelector("#photoList"),
  recordButton: document.querySelector("#recordButton"),
  voiceList: document.querySelector("#voiceList"),
  cancelFormButton: document.querySelector("#cancelFormButton"),
};

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function blankNotes() {
  return { description: "", photos: [], voiceRecordings: [] };
}

function newProject() {
  return { id: id(), title: `Project ${state.projects.length + 1}`, notes: blankNotes(), tasks: [] };
}

function newTask(project) {
  const weights = normalizedWeights(project.tasks.length + 1);
  return { id: id(), title: `Task ${project.tasks.length + 1}`, weight: weights[weights.length - 1], notes: blankNotes(), items: [] };
}

function newItem(task) {
  const weights = normalizedWeights(task.items.length + 1);
  return {
    id: id(),
    title: `Item ${task.items.length + 1}`,
    weight: weights[weights.length - 1],
    isDone: false,
    currentProgress: 0,
    maxProgress: 100,
    notes: blankNotes(),
    elapsedSeconds: 0,
    timerStartedAt: null,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function load() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
  try {
    state.projects = migrateProjects(JSON.parse(saved) || []);
  } catch {
    state.projects = [];
  }
  save();
}

function migrateProjects(projects) {
  return projects.map((project) => {
    if (Array.isArray(project.tasks)) {
      project.notes = project.notes || blankNotes();
      project.tasks.forEach((task) => {
        task.notes = task.notes || blankNotes();
        task.items = task.items || [];
        task.items.forEach(ensureItemProgress);
        normalize(task.items);
      });
      normalize(project.tasks);
      return project;
    }

    const tasks = [];
    (project.subprojects || []).forEach((subproject) => {
      (subproject.tasks || []).forEach((task) => {
        tasks.push({
          ...task,
          id: task.id || id(),
          title: task.title || "Task",
          notes: task.notes || blankNotes(),
          items: task.items || [],
        });
      });
    });
    const migrated = {
      id: project.id || id(),
      title: project.title || "Project",
      notes: project.notes || blankNotes(),
      tasks,
    };
    migrated.tasks.forEach((task) => {
      task.items.forEach(ensureItemProgress);
      normalize(task.items);
    });
    normalize(migrated.tasks);
    return migrated;
  });
}

function ensureItemProgress(item) {
  item.notes = item.notes || blankNotes();
  item.elapsedSeconds = item.elapsedSeconds || 0;
  item.timerStartedAt = item.timerStartedAt || null;
  item.maxProgress = Math.max(1, Number(item.maxProgress) || 100);
  const fallbackCurrent = item.isDone ? item.maxProgress : 0;
  item.currentProgress = Math.max(0, Math.min(item.maxProgress, Number(item.currentProgress) || fallbackCurrent));
  item.isDone = item.currentProgress >= item.maxProgress;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
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
  const ratio = itemProgressRatio(item);
  return item.weight * ratio;
}

function itemProgressRatio(item) {
  const maxProgress = Math.max(1, Number(item.maxProgress) || 100);
  const currentProgress = Math.max(0, Math.min(maxProgress, Number(item.currentProgress) || 0));
  return currentProgress / maxProgress;
}

function taskProgress(task) {
  return task.items.reduce((sum, item) => sum + itemProgress(item), 0);
}

function projectProgress(project) {
  return project.tasks.reduce((sum, task) => sum + (task.weight * taskProgress(task)) / 100, 0);
}

function formatTime(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60).toString().padStart(2, "0");
  const secs = (rounded % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

function formatProgressCount(item) {
  const maxProgress = Math.max(1, Number(item.maxProgress) || 100);
  const currentProgress = Math.max(0, Math.min(maxProgress, Number(item.currentProgress) || 0));
  return `${currentProgress}/${maxProgress}`;
}

function render() {
  els.emptyState.classList.toggle("hidden", state.projects.length > 0 || state.form);
  els.listView.classList.toggle("hidden", state.projects.length === 0 || state.form);
  els.formView.classList.toggle("hidden", !state.form);
  renderProjects();
  if (state.form) renderForm();
}

function renderProjects() {
  els.projectList.innerHTML = "";
  state.projects.forEach((project) => {
    els.projectList.append(projectNode(project));
  });
}

function projectNode(project) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  const isOpen = state.openProjectIds.has(project.id);
  wrapper.append(treeButton({
    title: project.title,
    meta: `${project.tasks.length} tasks`,
    progress: projectProgress(project),
    open: isOpen,
    depth: 0,
    actions: [
      { label: "+ Task", className: "secondary-button", onClick: () => openForm("task", "create", { projectId: project.id }) },
      { label: "Edit", className: "secondary-button", onClick: () => openForm("project", "edit", { projectId: project.id }) },
      { label: "Delete", className: "danger-button", onClick: () => deleteProject(project.id) },
    ],
    onClick: () => toggleSet(state.openProjectIds, project.id),
  }));

  if (isOpen) {
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!project.tasks.length) children.append(emptyLine("No tasks yet."));
    project.tasks.forEach((task) => children.append(taskNode(project, task)));
    wrapper.append(children);
  }

  return wrapper;
}

function taskNode(project, task) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  const isOpen = state.openTaskIds.has(task.id);
  wrapper.append(treeButton({
    title: task.title,
    meta: `${task.weight}% share | ${task.items.length} items`,
    progress: taskProgress(task),
    open: isOpen,
    depth: 1,
    actions: [
      { label: "+ Item", className: "secondary-button", onClick: () => openForm("item", "create", { projectId: project.id, taskId: task.id }) },
      { label: "Edit", className: "secondary-button", onClick: () => openForm("task", "edit", { projectId: project.id, taskId: task.id }) },
      { label: "Delete", className: "danger-button", onClick: () => deleteTask(project.id, task.id) },
    ],
    onClick: () => toggleSet(state.openTaskIds, task.id),
  }));

  if (isOpen) {
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!task.items.length) children.append(emptyLine("No items yet."));
    task.items.forEach((item) => children.append(itemNode(project, task, item)));
    wrapper.append(children);
  }

  return wrapper;
}

function itemNode(project, task, item) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  const isOpen = state.openItemIds.has(item.id);
  wrapper.append(treeButton({
    title: `${item.isDone ? "Done: " : ""}${item.title}`,
    meta: `${item.weight}% share | ${formatProgressCount(item)} | ${formatTime(itemElapsed(item))}`,
    progress: itemProgressRatio(item) * 100,
    open: isOpen,
    depth: 2,
    actions: [
      { label: "Edit", className: "secondary-button", onClick: () => openForm("item", "edit", { projectId: project.id, taskId: task.id, itemId: item.id }) },
      { label: "Delete", className: "danger-button", onClick: () => deleteItem(project.id, task.id, item.id) },
    ],
    onClick: () => toggleSet(state.openItemIds, item.id),
  }));

  if (isOpen) {
    const description = document.createElement("div");
    description.className = "item-description";
    description.textContent = item.notes.description || "No description yet.";
    wrapper.append(description);
  }

  return wrapper;
}

function treeButton({ title, meta, progress, open, depth, actions, onClick }) {
  const row = document.createElement("div");
  row.className = `tree-row depth-${depth}`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "tree-toggle";
  button.innerHTML = `
    <div class="tree-title"><span class="chevron">${open ? "-" : "+"}</span><span class="title-text"></span><strong>${Math.round(progress)}%</strong></div>
    <div class="progress-bar"><div style="width: ${progress}%"></div></div>
    <div class="tree-meta"></div>
  `;
  button.querySelector(".title-text").textContent = title;
  button.querySelector(".tree-meta").textContent = meta;
  button.addEventListener("click", onClick);

  const actionBar = document.createElement("div");
  actionBar.className = "row-actions";
  actions.forEach((action) => {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = action.className;
    actionButton.textContent = action.label;
    actionButton.addEventListener("click", (event) => {
      event.stopPropagation();
      action.onClick();
    });
    actionBar.append(actionButton);
  });

  row.append(button, actionBar);
  return row;
}

function emptyLine(text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  return p;
}

function toggleSet(set, value) {
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
  render();
}

function findProject(projectId) {
  return state.projects.find((project) => project.id === projectId) || null;
}

function findTask(projectId, taskId) {
  return findProject(projectId)?.tasks.find((task) => task.id === taskId) || null;
}

function findItem(projectId, taskId, itemId) {
  return findTask(projectId, taskId)?.items.find((item) => item.id === itemId) || null;
}

function findCollection(kind, ids) {
  if (kind === "project") return state.projects;
  if (kind === "task") return findProject(ids.projectId)?.tasks || [];
  return findTask(ids.projectId, ids.taskId)?.items || [];
}

function openForm(kind, mode, ids = {}) {
  const existing = mode === "edit" ? findExisting(kind, ids) : null;
  let draft = existing ? clone(existing) : newDraft(kind, ids);
  state.form = { kind, mode, ids, draft };
  render();
}

function findExisting(kind, ids) {
  if (kind === "project") return findProject(ids.projectId);
  if (kind === "task") return findTask(ids.projectId, ids.taskId);
  return findItem(ids.projectId, ids.taskId, ids.itemId);
}

function newDraft(kind, ids) {
  if (kind === "project") return newProject();
  if (kind === "task") return newTask(findProject(ids.projectId));
  return newItem(findTask(ids.projectId, ids.taskId));
}

function renderForm() {
  const { kind, mode, draft } = state.form;
  const isProject = kind === "project";
  const isItem = kind === "item";

  els.formKind.textContent = kind[0].toUpperCase() + kind.slice(1);
  els.formHeading.textContent = `${mode === "create" ? "New" : "Edit"} ${els.formKind.textContent}`;
  els.formTitle.value = draft.title;
  els.weightGroup.classList.toggle("hidden", isProject);
  els.formWeight.value = isProject ? 100 : draft.weight;
  els.doneGroup.classList.toggle("hidden", !isItem);
  els.currentProgressGroup.classList.toggle("hidden", !isItem);
  els.maxProgressGroup.classList.toggle("hidden", !isItem);
  els.timerGroup.classList.toggle("hidden", !isItem);
  els.formDone.checked = Boolean(draft.isDone);
  els.formCurrentProgress.value = draft.currentProgress ?? 0;
  els.formMaxProgress.value = draft.maxProgress ?? 100;
  els.formDescription.value = draft.notes.description || "";

  if (isItem) {
    els.timerText.textContent = formatTime(itemElapsed(draft));
    els.startStopTimerButton.textContent = draft.timerStartedAt ? "Stop" : "Start";
  }

  renderPhotos(draft.notes);
  renderVoiceNotes(draft.notes);
}

function syncFormDraft() {
  if (!state.form) return;
  const { draft, kind } = state.form;
  draft.title = els.formTitle.value.trim() || "Untitled";
  if (kind !== "project") draft.weight = Math.max(0, Math.min(100, Number(els.formWeight.value) || 0));
  if (kind === "item") {
    draft.maxProgress = Math.max(1, Number(els.formMaxProgress.value) || 1);
    draft.currentProgress = Math.max(0, Math.min(draft.maxProgress, Number(els.formCurrentProgress.value) || 0));
    draft.isDone = draft.currentProgress >= draft.maxProgress;
  }
  draft.notes.description = els.formDescription.value;
}

function closeForm() {
  stopRecordingIfNeeded();
  state.form = null;
  render();
}

function commitForm() {
  syncFormDraft();
  const { kind, mode, ids, draft } = state.form;

  if (mode === "create") {
    const collection = findCollection(kind, ids);
    collection.push(draft);
    if (kind !== "project") setWeight(collection, collection.length - 1, draft.weight);
    if (kind === "project") state.openProjectIds.add(draft.id);
    if (kind === "task") {
      state.openProjectIds.add(ids.projectId);
      state.openTaskIds.add(draft.id);
    }
    if (kind === "item") {
      state.openProjectIds.add(ids.projectId);
      state.openTaskIds.add(ids.taskId);
      state.openItemIds.add(draft.id);
    }
  } else {
    const collection = findCollection(kind, ids);
    const index = collection.findIndex((entry) => entry.id === draft.id);
    if (index >= 0) {
      collection[index] = draft;
      if (kind !== "project") setWeight(collection, index, draft.weight);
    }
  }

  save();
  closeForm();
}

function deleteProject(projectId) {
  if (!confirm("Remove this project and all its tasks and items?")) return;
  state.projects = state.projects.filter((project) => project.id !== projectId);
  state.openProjectIds.delete(projectId);
  save();
  render();
}

function deleteTask(projectId, taskId) {
  if (!confirm("Remove this task and all its items?")) return;
  const project = findProject(projectId);
  if (!project) return;
  project.tasks = project.tasks.filter((task) => task.id !== taskId);
  normalize(project.tasks);
  state.openTaskIds.delete(taskId);
  save();
  render();
}

function deleteItem(projectId, taskId, itemId) {
  if (!confirm("Remove this item?")) return;
  const task = findTask(projectId, taskId);
  if (!task) return;
  task.items = task.items.filter((item) => item.id !== itemId);
  normalize(task.items);
  state.openItemIds.delete(itemId);
  save();
  render();
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
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-attachment";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      syncFormDraft();
      notes.photos = notes.photos.filter((entry) => entry.id !== photo.id);
      renderForm();
    });
    tile.append(img, remove);
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
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = recording.dataUrl;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      syncFormDraft();
      notes.voiceRecordings = notes.voiceRecordings.filter((entry) => entry.id !== recording.id);
      renderForm();
    });
    row.append(audio, remove);
    els.voiceList.append(row);
  });
}

function selectedNotes() {
  return state.form?.draft.notes || null;
}

els.addProjectButton.addEventListener("click", () => openForm("project", "create"));

els.objectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  commitForm();
});

els.cancelFormButton.addEventListener("click", closeForm);

els.formDone.addEventListener("change", () => {
  if (!state.form || state.form.kind !== "item") return;
  const maxProgress = Math.max(1, Number(els.formMaxProgress.value) || 1);
  els.formCurrentProgress.value = els.formDone.checked ? maxProgress : 0;
});

els.startStopTimerButton.addEventListener("click", () => {
  if (!state.form || state.form.kind !== "item") return;
  syncFormDraft();
  const item = state.form.draft;
  if (!item.timerStartedAt) {
    item.timerStartedAt = Date.now();
  } else {
    item.elapsedSeconds = itemElapsed(item);
    item.timerStartedAt = null;
  }
  renderForm();
});

els.resetTimerButton.addEventListener("click", () => {
  if (!state.form || state.form.kind !== "item") return;
  state.form.draft.elapsedSeconds = 0;
  state.form.draft.timerStartedAt = null;
  renderForm();
});

els.photoInput.addEventListener("change", async () => {
  const notes = selectedNotes();
  if (!notes) return;
  syncFormDraft();
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
  renderForm();
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
  syncFormDraft();
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
    state.recorder = null;
    els.recordButton.textContent = "Record";
    renderForm();
  };
  state.recorder.start();
  els.recordButton.textContent = "Stop";
});

function stopRecordingIfNeeded() {
  if (state.recorder?.state === "recording") {
    state.recorder.stop();
  }
}

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
  if (state.form?.kind === "item" && state.form.draft.timerStartedAt) {
    els.timerText.textContent = formatTime(itemElapsed(state.form.draft));
  }
  renderProjects();
  save();
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
