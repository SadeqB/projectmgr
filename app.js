const DATA_SCHEMA_VERSION = 8;
const STORAGE_KEY = "project-time-manager-data";
const LEGACY_STORAGE_KEYS = ["project-time-manager-web-v2", "project-time-manager-web-v1"];
const SERVICE_WORKER_PATH = "service-worker.js";
const DATA_API_PATH = "api/data";
const PROJECT_COLORS = ["#2563eb", "#15945f", "#db6b2a", "#c026d3", "#0e7490", "#ca8a04", "#dc2626", "#4f46e5"];

const state = {
  projects: [],
  openProjectIds: new Set(),
  openTaskIds: new Set(),
  openItemIds: new Set(),
  detailsProjectId: null,
  showingDeadlines: false,
  showingGantt: false,
  showingAbout: false,
  showingToday: false,
  largeText: localStorage.getItem("project-time-manager-large-text") === "true",
  notificationsEnabled: false,
  menuOpen: false,
  form: null,
  search: "",
  statusFilter: "all",
  priorityFilter: "all",
  sort: "manual",
  confirmAction: null,
  undoAction: null,
  serverStorageAvailable: false,
  recorder: null,
  recordingChunks: [],
  lastTimerSaveAt: 0,
};

const els = {
  menuToggleButton: document.querySelector("#menuToggleButton"),
  menuBackdrop: document.querySelector("#menuBackdrop"),
  sidebar: document.querySelector("#sidebar"),
  addProjectButton: document.querySelector("#addProjectButton"),
  showTodayButton: document.querySelector("#showTodayButton"),
  showDeadlinesButton: document.querySelector("#showDeadlinesButton"),
  showGanttButton: document.querySelector("#showGanttButton"),
  showAboutButton: document.querySelector("#showAboutButton"),
  refreshButton: document.querySelector("#refreshButton"),
  storageStatus: document.querySelector("#storageStatus"),
  schemaStatus: document.querySelector("#schemaStatus"),
  projectCountStatus: document.querySelector("#projectCountStatus"),
  totalTimeStatus: document.querySelector("#totalTimeStatus"),
  runningTimerStatus: document.querySelector("#runningTimerStatus"),
  enableNotificationsButton: document.querySelector("#enableNotificationsButton"),
  largeTextButton: document.querySelector("#largeTextButton"),
  exportDataButton: document.querySelector("#exportDataButton"),
  importDataInput: document.querySelector("#importDataInput"),
  emptyState: document.querySelector("#emptyState"),
  listView: document.querySelector("#listView"),
  projectList: document.querySelector("#projectList"),
  quickAddButton: document.querySelector("#quickAddButton"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  priorityFilter: document.querySelector("#priorityFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  todayView: document.querySelector("#todayView"),
  todayStats: document.querySelector("#todayStats"),
  todayList: document.querySelector("#todayList"),
  closeTodayButton: document.querySelector("#closeTodayButton"),
  detailsView: document.querySelector("#detailsView"),
  detailsHeading: document.querySelector("#detailsHeading"),
  detailsStats: document.querySelector("#detailsStats"),
  closeDetailsButton: document.querySelector("#closeDetailsButton"),
  deadlinesView: document.querySelector("#deadlinesView"),
  deadlineList: document.querySelector("#deadlineList"),
  closeDeadlinesButton: document.querySelector("#closeDeadlinesButton"),
  ganttView: document.querySelector("#ganttView"),
  ganttChart: document.querySelector("#ganttChart"),
  closeGanttButton: document.querySelector("#closeGanttButton"),
  aboutView: document.querySelector("#aboutView"),
  closeAboutButton: document.querySelector("#closeAboutButton"),
  formView: document.querySelector("#formView"),
  objectForm: document.querySelector("#objectForm"),
  formKind: document.querySelector("#formKind"),
  formHeading: document.querySelector("#formHeading"),
  formTitle: document.querySelector("#formTitle"),
  formCreatedAt: document.querySelector("#formCreatedAt"),
  formStartDate: document.querySelector("#formStartDate"),
  formDeadline: document.querySelector("#formDeadline"),
  formStatus: document.querySelector("#formStatus"),
  formPriority: document.querySelector("#formPriority"),
  dependencyGroup: document.querySelector("#dependencyGroup"),
  formDependency: document.querySelector("#formDependency"),
  formTags: document.querySelector("#formTags"),
  recurrenceGroup: document.querySelector("#recurrenceGroup"),
  formRecurrence: document.querySelector("#formRecurrence"),
  formValidation: document.querySelector("#formValidation"),
  projectColorGroup: document.querySelector("#projectColorGroup"),
  formProjectColor: document.querySelector("#formProjectColor"),
  formNoDeadline: document.querySelector("#formNoDeadline"),
  doneGroup: document.querySelector("#doneGroup"),
  formDone: document.querySelector("#formDone"),
  currentProgressGroup: document.querySelector("#currentProgressGroup"),
  decrementProgressButton: document.querySelector("#decrementProgressButton"),
  incrementProgressButton: document.querySelector("#incrementProgressButton"),
  formCurrentProgress: document.querySelector("#formCurrentProgress"),
  formCurrentProgressText: document.querySelector("#formCurrentProgressText"),
  maxProgressGroup: document.querySelector("#maxProgressGroup"),
  formMaxProgress: document.querySelector("#formMaxProgress"),
  timerGroup: document.querySelector("#timerGroup"),
  timerText: document.querySelector("#timerText"),
  startStopTimerButton: document.querySelector("#startStopTimerButton"),
  resetTimerButton: document.querySelector("#resetTimerButton"),
  manualMinutesInput: document.querySelector("#manualMinutesInput"),
  addManualTimeButton: document.querySelector("#addManualTimeButton"),
  timeSessionList: document.querySelector("#timeSessionList"),
  formDescription: document.querySelector("#formDescription"),
  photoInput: document.querySelector("#photoInput"),
  photoList: document.querySelector("#photoList"),
  recordButton: document.querySelector("#recordButton"),
  voiceList: document.querySelector("#voiceList"),
  cancelFormButton: document.querySelector("#cancelFormButton"),
  mobileProjectsButton: document.querySelector("#mobileProjectsButton"),
  mobileTodayButton: document.querySelector("#mobileTodayButton"),
  mobileDeadlinesButton: document.querySelector("#mobileDeadlinesButton"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  appToast: document.querySelector("#appToast"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmHeading: document.querySelector("#confirmHeading"),
  confirmMessage: document.querySelector("#confirmMessage"),
  cancelConfirmButton: document.querySelector("#cancelConfirmButton"),
  acceptConfirmButton: document.querySelector("#acceptConfirmButton"),
};

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function blankNotes() {
  return { description: "", photos: [], voiceRecordings: [] };
}

function defaultProjectColor(index = state.projects.length) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

function normalizeProjectColor(value, fallback = defaultProjectColor()) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

function newProject() {
  const createdAt = nowISO();
  return {
    id: id(),
    title: `Project ${state.projects.length + 1}`,
    color: defaultProjectColor(),
    createdAt,
    startDate: dateInputValue(createdAt),
    deadline: "",
    status: "planned",
    priority: "normal",
    dependsOn: "",
    tags: [],
    updatedAt: createdAt,
    notes: blankNotes(),
    tasks: [],
  };
}

function newTask(project) {
  const createdAt = nowISO();
  return { id: id(), title: `Task ${project.tasks.length + 1}`, createdAt, updatedAt: createdAt, startDate: dateInputValue(createdAt), deadline: "", status: "planned", priority: "normal", tags: [], recurrence: "none", dependsOn: "", notes: blankNotes(), items: [] };
}

function newItem(task) {
  return {
    id: id(),
    title: `Item ${task.items.length + 1}`,
    createdAt: nowISO(),
    startDate: dateInputValue(nowISO()),
    deadline: "",
    status: "planned",
    priority: "normal",
    dependsOn: "",
    tags: [],
    recurrence: "none",
    updatedAt: nowISO(),
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

function nowISO() {
  return new Date().toISOString();
}

async function load() {
  const saved = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
  let localProjects = [];

  try {
    localProjects = readDataDocument(JSON.parse(saved));
  } catch {
    localProjects = [];
  }

  let loadedFromServer = false;

  try {
    const response = await fetch(DATA_API_PATH, { cache: "no-store" });
    if (response.ok) {
      const document = await response.json();
      const serverProjects = readDataDocument(document);
      state.serverStorageAvailable = true;
      state.projects = serverProjects.length === 0 && localProjects.length > 0 ? localProjects : serverProjects;
      loadedFromServer = true;
      if (serverProjects.length === 0 && localProjects.length > 0) {
        await save();
      }
    }
  } catch {
    state.serverStorageAvailable = false;
  }

  if (loadedFromServer) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createDataDocument()));
    return;
  }

  state.projects = localProjects;
  await save();
}

async function refreshProjectsFromStorage() {
  try {
    const response = await fetch(DATA_API_PATH, { cache: "no-store" });
    if (response.ok) {
      state.projects = readDataDocument(await response.json());
      state.serverStorageAvailable = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(createDataDocument()));
      return;
    }
  } catch {
    state.serverStorageAvailable = false;
  }

  const saved = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
  try {
    state.projects = readDataDocument(JSON.parse(saved));
  } catch {
    state.projects = [];
  }
}

function readDataDocument(document) {
  if (!document) return [];
  if (Array.isArray(document)) return migrateProjects(document);
  if (document.app !== "ProjectTimeManager") return [];
  return migrateProjects(document.projects || []);
}

function migrateProjects(projects) {
  return projects.map((project, index) => {
    if (Array.isArray(project.tasks)) {
      ensureScheduleFields(project);
      project.color = normalizeProjectColor(project.color, defaultProjectColor(index));
      project.notes = project.notes || blankNotes();
      project.tasks.forEach((task) => {
        ensureScheduleFields(task);
        task.notes = task.notes || blankNotes();
        task.items = task.items || [];
        task.items.forEach((item) => {
          ensureScheduleFields(item);
          ensureItemProgress(item);
        });
      });
      return project;
    }

    const tasks = [];
    (project.subprojects || []).forEach((subproject) => {
      (subproject.tasks || []).forEach((task) => {
        tasks.push({
          ...task,
          id: task.id || id(),
          title: task.title || "Task",
          createdAt: task.createdAt || subproject.createdAt || nowISO(),
          deadline: task.deadline || subproject.deadline || "",
          notes: task.notes || blankNotes(),
          items: task.items || [],
        });
      });
    });
    const migrated = {
      id: project.id || id(),
      title: project.title || "Project",
      color: normalizeProjectColor(project.color, defaultProjectColor(index)),
      createdAt: project.createdAt || nowISO(),
      deadline: project.deadline || "",
      notes: project.notes || blankNotes(),
      tasks,
    };
    migrated.tasks.forEach((task) => {
      ensureScheduleFields(task);
      task.items.forEach((item) => {
        ensureScheduleFields(item);
        ensureItemProgress(item);
      });
    });
    return migrated;
  });
}

function ensureScheduleFields(entry) {
  entry.createdAt = entry.createdAt || nowISO();
  entry.startDate = entry.startDate || dateInputValue(entry.createdAt);
  entry.deadline = entry.deadline || "";
  entry.status = ["planned", "in-progress", "blocked", "completed", "archived"].includes(entry.status) ? entry.status : "planned";
  entry.priority = ["urgent", "high", "normal", "low"].includes(entry.priority) ? entry.priority : "normal";
  entry.dependsOn = entry.dependsOn || "";
  entry.tags = Array.isArray(entry.tags) ? entry.tags : [];
  entry.updatedAt = entry.updatedAt || entry.createdAt;
  if (entry.recurrence === undefined) entry.recurrence = "none";
}

function ensureItemProgress(item) {
  item.notes = item.notes || blankNotes();
  item.elapsedSeconds = item.elapsedSeconds || 0;
  item.timerStartedAt = item.timerStartedAt || null;
  item.timeSessions = Array.isArray(item.timeSessions) ? item.timeSessions : [];
  item.maxProgress = Math.max(1, Number(item.maxProgress) || 100);
  const fallbackCurrent = item.isDone ? item.maxProgress : 0;
  item.currentProgress = Math.max(0, Math.min(item.maxProgress, Number(item.currentProgress) || fallbackCurrent));
  item.isDone = item.currentProgress >= item.maxProgress;
  if (item.isDone && (!item.status || item.status === "planned")) item.status = "completed";
}

async function save() {
  const document = createDataDocument();
  const serialized = JSON.stringify(document);
  localStorage.setItem(STORAGE_KEY, serialized);

  try {
    const response = await fetch(DATA_API_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: serialized,
    });
    state.serverStorageAvailable = response.ok;
  } catch {
    state.serverStorageAvailable = false;
  }
}

function createDataDocument() {
  return {
    app: "ProjectTimeManager",
    schemaVersion: DATA_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    projects: serializeProjects(state.projects),
  };
}

function serializeProjects(projects) {
  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    color: normalizeProjectColor(project.color),
    createdAt: project.createdAt,
    startDate: project.startDate || dateInputValue(project.createdAt),
    deadline: project.deadline || "",
    status: project.status,
    priority: project.priority,
    dependsOn: project.dependsOn,
    tags: project.tags,
    updatedAt: project.updatedAt,
    notes: project.notes,
    tasks: (project.tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      createdAt: task.createdAt,
      startDate: task.startDate || dateInputValue(task.createdAt),
      deadline: task.deadline || "",
      status: task.status,
      priority: task.priority,
      dependsOn: task.dependsOn,
      tags: task.tags,
      recurrence: task.recurrence,
      updatedAt: task.updatedAt,
      notes: task.notes,
      items: (task.items || []).map((item) => ({
        id: item.id,
        title: item.title,
        createdAt: item.createdAt,
        startDate: item.startDate || dateInputValue(item.createdAt),
        deadline: item.deadline || "",
        status: item.status,
        priority: item.priority,
        dependsOn: item.dependsOn,
        tags: item.tags,
        recurrence: item.recurrence,
        updatedAt: item.updatedAt,
        isDone: item.isDone,
        currentProgress: item.currentProgress,
        maxProgress: item.maxProgress,
        notes: item.notes,
        elapsedSeconds: item.elapsedSeconds,
        timerStartedAt: item.timerStartedAt,
        timeSessions: item.timeSessions,
      })),
    })),
  }));
}

function itemElapsed(item) {
  const running = item.timerStartedAt ? (Date.now() - item.timerStartedAt) / 1000 : 0;
  return item.elapsedSeconds + running;
}

function itemProgress(item) {
  return itemProgressRatio(item) * 100;
}

function itemProgressRatio(item) {
  const maxProgress = Math.max(1, Number(item.maxProgress) || 100);
  const currentProgress = Math.max(0, Math.min(maxProgress, Number(item.currentProgress) || 0));
  return currentProgress / maxProgress;
}

function taskProgress(task) {
  if (!task.items.length) return 0;
  return task.items.reduce((sum, item) => sum + itemProgress(item), 0) / task.items.length;
}

function projectProgress(project) {
  if (!project.tasks.length) return 0;
  return project.tasks.reduce((sum, task) => sum + taskProgress(task), 0) / project.tasks.length;
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

function dateInputValue(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatDate(value, fallback = "No date") {
  if (!value) return fallback;
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function dateValue(value) {
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function rawDaysBetween(start, end) {
  return Math.round((end - start) / 86_400_000);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - day + 1);
  return next;
}

function weekLabel(date) {
  return `${date.toLocaleDateString(undefined, { month: "short" })} ${date.getDate()}`;
}

function render() {
  const hasProjects = state.projects.length > 0;
  const showingSecondaryPage = Boolean(state.form || state.detailsProjectId || state.showingDeadlines || state.showingGantt || state.showingAbout || state.showingToday);
  document.body.classList.toggle("menu-open", state.menuOpen);
  document.body.classList.toggle("large-text", state.largeText);
  els.menuBackdrop.hidden = !state.menuOpen;
  els.menuToggleButton.setAttribute("aria-expanded", String(state.menuOpen));
  els.menuToggleButton.setAttribute("aria-label", state.menuOpen ? "Close menu" : "Open menu");
  els.emptyState.classList.toggle("hidden", hasProjects || showingSecondaryPage);
  els.listView.classList.toggle("hidden", !hasProjects || showingSecondaryPage);
  els.formView.classList.toggle("hidden", !state.form);
  els.detailsView.classList.toggle("hidden", !state.detailsProjectId);
  els.deadlinesView.classList.toggle("hidden", !state.showingDeadlines);
  els.ganttView.classList.toggle("hidden", !state.showingGantt);
  els.aboutView.classList.toggle("hidden", !state.showingAbout);
  els.todayView.classList.toggle("hidden", !state.showingToday);
  els.searchInput.value = state.search;
  els.statusFilter.value = state.statusFilter;
  els.priorityFilter.value = state.priorityFilter;
  els.sortSelect.value = state.sort;
  renderProjects();
  renderAboutStatus();
  if (state.form) renderForm();
  if (state.detailsProjectId) renderDetails();
  if (state.showingDeadlines) renderDeadlines();
  if (state.showingGantt) renderGantt();
  if (state.showingToday) renderToday();
}

function renderAboutStatus() {
  els.storageStatus.textContent = state.serverStorageAvailable ? "data.json" : "Browser only";
  els.schemaStatus.textContent = `v${DATA_SCHEMA_VERSION}`;
  els.projectCountStatus.textContent = String(state.projects.length);
  els.totalTimeStatus.textContent = formatTime(allItems().reduce((sum, item) => sum + itemElapsed(item), 0));
  els.runningTimerStatus.textContent = String(allItems().filter((item) => item.timerStartedAt).length);
  els.enableNotificationsButton.textContent = typeof Notification === "undefined" ? "Reminders unavailable" : Notification.permission === "granted" ? "Reminders enabled" : "Enable reminders";
  els.largeTextButton.textContent = state.largeText ? "Standard text" : "Larger text";
}

function renderProjects() {
  els.projectList.innerHTML = "";
  filteredProjects().forEach((project) => {
    els.projectList.append(projectNode(project));
  });
  if (!els.projectList.children.length) els.projectList.append(emptyLine("No matching work found."));
}

function filteredProjects() {
  const query = state.search.trim().toLowerCase();
  const matches = (entry) => {
    const text = [entry.title, entry.notes?.description, ...(entry.tags || [])].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (state.statusFilter === "all" || entry.status === state.statusFilter) && (state.priorityFilter === "all" || entry.priority === state.priorityFilter);
  };
  const projects = state.projects.filter((project) => matches(project) || project.tasks.some((task) => matches(task) || task.items.some(matches)));
  return [...projects].sort((a, b) => {
    const priorityOrder = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityOrder) return priorityOrder;
    if (state.sort === "title") return a.title.localeCompare(b.title);
    if (state.sort === "progress") return projectProgress(b) - projectProgress(a);
    if (state.sort === "deadline") return dateSort(a.deadline, b.deadline);
    if (state.sort === "updated") return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    return 0;
  });
}

function priorityRank(value) {
  return { urgent: 0, high: 1, normal: 2, low: 3 }[value] ?? 2;
}

function prioritySort(a, b) {
  const result = priorityRank(a.priority) - priorityRank(b.priority);
  return result || a.title.localeCompare(b.title);
}

function dateSort(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a) - new Date(b);
}

function allItems() {
  return state.projects.flatMap((project) => project.tasks.flatMap((task) => task.items));
}

function statusLabel(value) { return String(value || "planned").replace("in-progress", "In progress").replace(/^./, (char) => char.toUpperCase()); }
function priorityLabel(value) { return String(value || "normal").replace(/^./, (char) => char.toUpperCase()); }

function projectNode(project) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  const isOpen = state.openProjectIds.has(project.id);
  wrapper.append(treeButton({
    title: project.title,
    meta: `${project.tasks.length} tasks | ${statusLabel(project.status)} | ${priorityLabel(project.priority)}`,
    progress: projectProgress(project),
    open: isOpen,
    depth: 0,
    color: project.color,
    actions: [
      { label: "+ Task", className: "secondary-button", onClick: () => openForm("task", "create", { projectId: project.id }) },
      { label: "Details", icon: "info", className: "icon-action", onClick: () => openDetails(project.id) },
      { label: "Edit", icon: "edit", className: "icon-action", onClick: () => openForm("project", "edit", { projectId: project.id }) },
      { label: "Delete", icon: "delete", className: "icon-action danger-icon", onClick: () => deleteProject(project.id) },
    ],
    onClick: () => toggleSet(state.openProjectIds, project.id),
  }));

  if (isOpen) {
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!project.tasks.length) children.append(emptyLine("No tasks yet."));
    [...project.tasks].sort(prioritySort).forEach((task) => children.append(taskNode(project, task)));
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
    meta: `${task.items.length} items | ${statusLabel(task.status)} | ${priorityLabel(task.priority)}`,
    progress: taskProgress(task),
    open: isOpen,
    depth: 1,
    color: project.color,
    actions: [
      { label: "+ Item", className: "secondary-button", onClick: () => openForm("item", "create", { projectId: project.id, taskId: task.id }) },
      { label: "Edit", icon: "edit", className: "icon-action", onClick: () => openForm("task", "edit", { projectId: project.id, taskId: task.id }) },
      { label: "Delete", icon: "delete", className: "icon-action danger-icon", onClick: () => deleteTask(project.id, task.id) },
    ],
    onClick: () => toggleSet(state.openTaskIds, task.id),
  }));

  if (isOpen) {
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!task.items.length) children.append(emptyLine("No items yet."));
    [...task.items].sort(prioritySort).forEach((item) => children.append(itemNode(project, task, item)));
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
    meta: `${formatProgressCount(item)} | ${statusLabel(item.status)} | ${formatTime(itemElapsed(item))}`,
    progress: itemProgressRatio(item) * 100,
    open: isOpen,
    depth: 2,
    color: project.color,
    actions: [
      { label: "Edit", icon: "edit", className: "icon-action", onClick: () => openForm("item", "edit", { projectId: project.id, taskId: task.id, itemId: item.id }) },
      { label: item.timerStartedAt ? "Stop timer" : "Start timer", icon: item.timerStartedAt ? "pause" : "play", className: "icon-action timer-action", onClick: () => toggleItemTimer(item) },
      { label: "Delete", icon: "delete", className: "icon-action danger-icon", onClick: () => deleteItem(project.id, task.id, item.id) },
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

function treeButton({ title, meta, progress, open, depth, color, actions, onClick }) {
  const row = document.createElement("div");
  row.className = `tree-row depth-${depth}`;
  row.style.setProperty("--project-color", normalizeProjectColor(color));

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
  let touchStartX = 0;
  button.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].clientX; }, { passive: true });
  button.addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) < 50) return;
    const swipeAction = distance < 0 ? actions.find((action) => action.icon === "edit") : actions.find((action) => action.icon === "play");
    if (swipeAction) { event.preventDefault(); swipeAction.onClick(); }
  }, { passive: false });

  const actionBar = document.createElement("div");
  actionBar.className = "row-actions";
  actions.forEach((action) => {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = action.className;
    actionButton.title = action.label;
    actionButton.setAttribute("aria-label", action.label);
    actionButton.innerHTML = action.icon ? iconMarkup(action.icon) : "";
    if (!action.icon) actionButton.textContent = action.label;
    actionButton.addEventListener("click", (event) => {
      event.stopPropagation();
      action.onClick();
    });
    actionBar.append(actionButton);
  });

  row.append(button, actionBar);
  return row;
}

function iconMarkup(name) {
  const icons = {
    info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="10" x2="12" y2="16"></line><line x1="12" y1="7" x2="12.01" y2="7"></line></svg>`,
    edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>`,
    delete: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>`,
    play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"></path></svg>`,
    pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"></path></svg>`,
  };
  return icons[name] || "";
}

async function openDetails(projectId) {
  await refreshProjectsFromStorage();
  state.detailsProjectId = projectId;
  state.form = null;
  state.showingDeadlines = false;
  state.showingGantt = false;
  state.showingAbout = false;
  state.showingToday = false;
  render();
}

function renderDetails() {
  const project = findProject(state.detailsProjectId);
  if (!project) {
    state.detailsProjectId = null;
    render();
    return;
  }

  const stats = projectStats(project);
  els.detailsHeading.textContent = project.title;
  els.detailsStats.innerHTML = "";
  [
    ["Created", formatDate(project.createdAt, "No creation date")],
    ["Start Date", formatDate(project.startDate || project.createdAt, "No start date")],
    ["Deadline", formatDate(project.deadline, "No deadline")],
    ["Tasks", stats.taskCount],
    ["Items", stats.itemCount],
    ["Total Item Time", formatTime(stats.totalSeconds)],
    ["Time Sessions", stats.sessionCount],
    ["Progress", `${Math.round(projectProgress(project))}%`],
    ["Open / blocked", `${stats.openCount} / ${stats.blockedCount}`],
    ["High priority", stats.highPriorityCount],
    ["Tags", stats.tags.join(", ") || "None"],
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<span></span><strong></strong>`;
    card.querySelector("span").textContent = label;
    card.querySelector("strong").textContent = value;
    els.detailsStats.append(card);
  });
}

function projectStats(project) {
  let itemCount = 0;
  let totalSeconds = 0;
  let openCount = 0;
  let blockedCount = 0;
  let highPriorityCount = 0;
  let sessionCount = 0;
  const tags = new Set(project.tags || []);
  project.tasks.forEach((task) => {
    (task.tags || []).forEach((tag) => tags.add(tag));
    if (task.status !== "completed" && task.status !== "archived") openCount += 1;
    if (task.status === "blocked") blockedCount += 1;
    if (["high", "urgent"].includes(task.priority)) highPriorityCount += 1;
    itemCount += task.items.length;
    task.items.forEach((item) => {
      totalSeconds += itemElapsed(item);
      sessionCount += (item.timeSessions || []).length;
      (item.tags || []).forEach((tag) => tags.add(tag));
      if (item.status !== "completed" && item.status !== "archived") openCount += 1;
      if (item.status === "blocked") blockedCount += 1;
      if (["high", "urgent"].includes(item.priority)) highPriorityCount += 1;
    });
  });
  return { taskCount: project.tasks.length, itemCount, totalSeconds, sessionCount, openCount, blockedCount, highPriorityCount, tags: [...tags] };
}

function renderToday() {
  const today = dateInputValue(new Date().toISOString());
  const due = [];
  const overdue = [];
  allEntries().forEach((entry) => {
    if (entry.deadline === today || entry.startDate === today) due.push(entry);
    if (entry.deadline && entry.deadline < today && entry.status !== "completed" && entry.status !== "archived") overdue.push(entry);
  });
  const focus = [...new Set([...overdue, ...due])];
  const trackedToday = allItems().reduce((sum, item) => sum + (item.timeSessions || []).filter((session) => session.date === today).reduce((n, session) => n + session.seconds, 0), 0);
  els.todayStats.innerHTML = "";
  [["Due today", due.length], ["Overdue", overdue.length], ["Time today", formatTime(trackedToday)], ["Running timers", allItems().filter((item) => item.timerStartedAt).length]].forEach(([label, value]) => {
    const card = document.createElement("div"); card.className = "stat-card"; card.innerHTML = "<span></span><strong></strong>"; card.querySelector("span").textContent = label; card.querySelector("strong").textContent = value; els.todayStats.append(card);
  });
  els.todayList.innerHTML = "";
  if (!focus.length) { els.todayList.append(emptyLine("Nothing is due today.")); return; }
  focus.sort((a, b) => dateSort(a.deadline, b.deadline)).forEach((entry) => {
    const row = document.createElement("div"); row.className = `today-row ${entry.deadline < today ? "overdue" : ""}`;
    row.innerHTML = "<div><span class=eyebrow></span><strong></strong><p></p></div><span class=today-progress></span>";
    row.querySelector(".eyebrow").textContent = entry.kind;
    row.querySelector("strong").textContent = entry.title;
    row.querySelector("p").textContent = `${entry.path} | ${entry.deadline ? `Due ${formatDate(entry.deadline)}` : "Starts today"}`;
    row.querySelector(".today-progress").textContent = `${Math.round(entry.progress)}%`;
    els.todayList.append(row);
  });
}

function allEntries() {
  const entries = [];
  state.projects.forEach((project) => { entries.push({ ...project, kind: "Project", path: project.title, progress: projectProgress(project) }); project.tasks.forEach((task) => { entries.push({ ...task, kind: "Task", path: project.title, progress: taskProgress(task) }); task.items.forEach((item) => entries.push({ ...item, kind: "Item", path: `${project.title} / ${task.title}`, progress: itemProgress(item) })); }); });
  return entries;
}

function renderDeadlines() {
  const deadlines = collectDeadlines();
  els.deadlineList.innerHTML = "";

  if (!deadlines.length) {
    els.deadlineList.append(emptyLine("No deadlines defined."));
    return;
  }

  deadlines.forEach((entry) => {
    const row = document.createElement("div");
    row.className = `deadline-row ${entry.deadline < dateInputValue(new Date().toISOString()) ? "overdue" : ""}`;
    row.innerHTML = `
      <div>
        <span class="eyebrow"></span>
        <strong></strong>
        <p></p>
      </div>
      <time></time>
    `;
    row.querySelector(".eyebrow").textContent = entry.kind;
    row.querySelector("strong").textContent = entry.title;
    row.querySelector("p").textContent = entry.path;
    row.querySelector("time").textContent = formatDate(entry.deadline, "No deadline");
    els.deadlineList.append(row);
  });
}

function renderGantt() {
  const rows = collectGanttRows();
  const scheduledRows = rows.filter((row) => row.start && row.end);
  els.ganttChart.innerHTML = "";

  if (!rows.length) {
    els.ganttChart.append(emptyLine("No projects or tasks to show."));
    return;
  }

  if (!scheduledRows.length) {
    els.ganttChart.append(emptyLine("Add start dates and deadlines to projects or tasks to show timeline bars."));
    return;
  }

  const minDate = startOfWeek(new Date(Math.min(...scheduledRows.map((row) => row.start.getTime()))));
  const maxDate = startOfWeek(new Date(Math.max(...scheduledRows.map((row) => row.end.getTime()))));
  const weekCount = Math.max(1, Math.floor(daysBetween(minDate, maxDate) / 7) + 1);
  const totalTimelineDays = weekCount * 7;
  const weekColumns = `220px repeat(${weekCount}, minmax(74px, 1fr))`;

  const header = document.createElement("div");
  header.className = "gantt-table-row gantt-header";
  header.style.gridTemplateColumns = weekColumns;
  const labelHead = document.createElement("div");
  labelHead.className = "gantt-task-head";
  labelHead.textContent = "Project / Task / Item";
  header.append(labelHead);
  for (let index = 0; index < weekCount; index += 1) {
    const cell = document.createElement("div");
    cell.className = "gantt-week-head";
    cell.textContent = weekLabel(addDays(minDate, index * 7));
    header.append(cell);
  }
  els.ganttChart.append(header);

  rows.forEach((row) => {
    const line = document.createElement("div");
    line.className = `gantt-table-row ${row.kind.toLowerCase()}-row`;
    line.style.gridTemplateColumns = weekColumns;

    const label = document.createElement("div");
    label.className = "gantt-label";
    label.innerHTML = `<span></span><strong></strong><small></small>`;
    label.querySelector("span").textContent = row.kind;
    label.querySelector("strong").textContent = row.title;
    label.querySelector("small").textContent = row.end ? `${formatDate(row.start)} - ${formatDate(row.end)}` : "No deadline";

    const timeline = document.createElement("div");
    timeline.className = "gantt-timeline";
    timeline.style.gridColumn = `2 / span ${weekCount}`;
    timeline.style.gridTemplateColumns = `repeat(${weekCount}, minmax(74px, 1fr))`;

    for (let index = 0; index < weekCount; index += 1) {
      const cell = document.createElement("div");
      cell.className = "gantt-week-cell";
      timeline.append(cell);
    }

    if (row.start && row.end) {
      const startOffset = Math.max(0, rawDaysBetween(minDate, row.start));
      const endOffset = Math.min(totalTimelineDays, rawDaysBetween(minDate, row.end) + 1);
      const left = Math.min(100, (startOffset / totalTimelineDays) * 100);
      const width = Math.max(0.8, ((Math.max(endOffset, startOffset + 1) - startOffset) / totalTimelineDays) * 100);
      const bar = document.createElement("div");
      bar.className = "gantt-bar";
      bar.style.setProperty("--project-color", normalizeProjectColor(row.color));
      bar.style.left = `${left}%`;
      bar.style.width = `${Math.min(100 - left, width)}%`;
      bar.innerHTML = `<div style="width: ${row.progress}%"></div><span>${Math.round(row.progress)}%</span>`;
      timeline.append(bar);
    } else {
      const missing = document.createElement("span");
      missing.className = "gantt-missing";
      missing.textContent = "No deadline";
      timeline.append(missing);
    }

    const today = dateValue(dateInputValue(new Date().toISOString()));
    if (today && today >= minDate && today <= addDays(minDate, totalTimelineDays)) {
      const marker = document.createElement("span");
      marker.className = "gantt-today-marker";
      marker.style.left = `${Math.max(0, Math.min(100, rawDaysBetween(minDate, today) / totalTimelineDays * 100))}%`;
      marker.title = "Today";
      timeline.append(marker);
    }

    line.append(label, timeline);
    els.ganttChart.append(line);
  });
}

function collectGanttRows() {
  const rows = [];
  [...state.projects].sort(prioritySort).forEach((project) => {
    rows.push({
      kind: "Project",
      title: project.title,
      start: dateValue(project.startDate || project.createdAt),
      end: dateValue(project.deadline),
      progress: projectProgress(project),
      color: project.color,
    });
    [...project.tasks].sort(prioritySort).forEach((task) => {
      rows.push({
        kind: "Task",
        title: task.title,
        start: dateValue(task.startDate || task.createdAt),
        end: dateValue(task.deadline),
        progress: taskProgress(task),
        color: project.color,
      });
      [...task.items].sort(prioritySort).forEach((item) => {
        rows.push({
          kind: "Item",
          title: item.title,
          start: dateValue(item.startDate || item.createdAt),
          end: dateValue(item.deadline),
          progress: itemProgress(item),
          color: project.color,
        });
      });
    });
  });
  return rows;
}

function collectDeadlines() {
  const entries = [];
  state.projects.forEach((project) => {
    if (project.deadline) {
      entries.push({ kind: "Project", title: project.title, path: project.title, deadline: project.deadline });
    }
    project.tasks.forEach((task) => {
      if (task.deadline) {
        entries.push({ kind: "Task", title: task.title, path: project.title, deadline: task.deadline });
      }
      task.items.forEach((item) => {
        if (item.deadline) {
          entries.push({ kind: "Item", title: item.title, path: `${project.title} / ${task.title}`, deadline: item.deadline });
        }
      });
    });
  });
  return entries.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
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
  state.detailsProjectId = null;
  state.showingDeadlines = false;
  state.showingGantt = false;
  state.showingAbout = false;
  state.showingToday = false;
  state.formWasEdited = false;
  setTimeout(() => els.formTitle.focus(), 0);
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
  const isRepeatable = kind === "task" || isItem;

  els.formKind.textContent = kind[0].toUpperCase() + kind.slice(1);
  els.formHeading.textContent = `${mode === "create" ? "New" : "Edit"} ${els.formKind.textContent}`;
  els.formTitle.value = draft.title;
  els.formCreatedAt.value = dateInputValue(draft.createdAt);
  els.formStartDate.value = dateInputValue(draft.startDate || draft.createdAt);
  els.formDeadline.value = dateInputValue(draft.deadline);
  els.formStatus.value = draft.status || "planned";
  els.formPriority.value = draft.priority || "normal";
  els.dependencyGroup.classList.toggle("hidden", kind !== "task");
  els.formDependency.innerHTML = "<option value=\"\">No dependency</option>";
  if (kind === "task") {
    const project = findProject(state.form.ids.projectId);
    (project?.tasks || []).filter((task) => task.id !== draft.id).forEach((task) => {
      const option = document.createElement("option"); option.value = task.id; option.textContent = task.title; els.formDependency.append(option);
    });
  }
  els.formDependency.value = draft.dependsOn || "";
  els.formTags.value = (draft.tags || []).join(", ");
  els.recurrenceGroup.classList.toggle("hidden", !isRepeatable);
  els.formRecurrence.value = draft.recurrence || "none";
  els.projectColorGroup.classList.toggle("hidden", !isProject);
  els.formProjectColor.value = normalizeProjectColor(draft.color);
  els.formNoDeadline.checked = !draft.deadline;
  updateDeadlineControl();
  els.doneGroup.classList.toggle("hidden", !isItem);
  els.currentProgressGroup.classList.toggle("hidden", !isItem);
  els.maxProgressGroup.classList.toggle("hidden", !isItem);
  els.timerGroup.classList.toggle("hidden", !isItem);
  els.formDone.checked = Boolean(draft.isDone);
  els.formMaxProgress.value = draft.maxProgress ?? 100;
  updateProgressSlider(draft.currentProgress ?? 0, draft.maxProgress ?? 100);
  els.formDescription.value = draft.notes.description || "";
  els.formValidation.textContent = "";

  if (isItem) {
    els.timerText.textContent = formatTime(itemElapsed(draft));
    els.startStopTimerButton.textContent = draft.timerStartedAt ? "Stop" : "Start";
    renderTimeSessions(draft);
  } else {
    els.timeSessionList.innerHTML = "";
  }

  renderPhotos(draft.notes);
  renderVoiceNotes(draft.notes);
}

function renderTimeSessions(item) {
  els.timeSessionList.innerHTML = "";
  if (!item.timeSessions?.length) return;
  const heading = document.createElement("h3"); heading.textContent = "Time sessions"; els.timeSessionList.append(heading);
  item.timeSessions.slice().reverse().forEach((session) => {
    const row = document.createElement("div"); row.className = "time-session-row";
    row.innerHTML = "<span></span><strong></strong>";
    row.querySelector("span").textContent = formatDate(session.date);
    row.querySelector("strong").textContent = formatTime(session.seconds);
    els.timeSessionList.append(row);
  });
}

function syncFormDraft() {
  if (!state.form) return;
  const { draft, kind } = state.form;
  draft.title = els.formTitle.value.trim() || "Untitled";
  draft.createdAt = draft.createdAt || nowISO();
  draft.startDate = els.formStartDate.value || dateInputValue(draft.createdAt);
  draft.deadline = els.formNoDeadline.checked ? "" : (els.formDeadline.value || "");
  draft.status = els.formStatus.value;
  draft.priority = els.formPriority.value;
  draft.dependsOn = kind === "task" ? els.formDependency.value : draft.dependsOn || "";
  draft.tags = els.formTags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
  draft.updatedAt = nowISO();
  if (kind === "task" || kind === "item") draft.recurrence = els.formRecurrence.value;
  if (kind === "project") {
    draft.color = normalizeProjectColor(els.formProjectColor.value, draft.color || defaultProjectColor());
  }
  if (kind === "item") {
    draft.maxProgress = Math.max(1, Number(els.formMaxProgress.value) || 1);
    draft.currentProgress = Math.max(0, Math.min(draft.maxProgress, Number(els.formCurrentProgress.value) || 0));
    draft.isDone = draft.currentProgress >= draft.maxProgress;
    if (draft.isDone) draft.status = "completed";
    else if (draft.currentProgress > 0 && draft.status === "planned") draft.status = "in-progress";
  }
  draft.notes.description = els.formDescription.value;
}

function closeForm() {
  stopRecordingIfNeeded();
  if (state.form?.mode === "edit" && state.formWasEdited && !window.confirm("Discard unsaved changes?")) return;
  state.form = null;
  render();
}

function closeDetails() {
  state.detailsProjectId = null;
  render();
}

function closeDeadlines() {
  state.showingDeadlines = false;
  render();
}

function closeGantt() {
  state.showingGantt = false;
  render();
}

function closeAbout() {
  state.showingAbout = false;
  render();
}

function closeMenu() {
  state.menuOpen = false;
}

async function commitForm() {
  syncFormDraft();
  const { kind, mode, ids, draft } = state.form;
  const start = dateValue(draft.startDate);
  const deadline = dateValue(draft.deadline);
  if (deadline && start && deadline < start) {
    els.formValidation.textContent = "Deadline must be on or after the start date.";
    return;
  }
  if (draft.status === "completed" && kind === "item") draft.currentProgress = draft.maxProgress;
  if (kind === "task" && draft.dependsOn) {
    const dependency = findTask(ids.projectId, draft.dependsOn);
    if (dependency && dependency.status !== "completed" && dependency.status !== "archived") {
      els.formValidation.textContent = `Complete dependency first: ${dependency.title}.`;
      return;
    }
  }

  if (mode === "create") {
    const collection = findCollection(kind, ids);
    collection.push(draft);
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
    }
  }

  if (kind !== "project") {
    const parent = findProject(ids.projectId);
    if (parent) parent.updatedAt = draft.updatedAt;
  }

  if (draft.status === "completed" && (kind === "task" || kind === "item") && draft.recurrence !== "none") {
    const next = clone(draft);
    next.id = id();
    next.title = `${draft.title} (next)`;
    next.createdAt = nowISO();
    next.updatedAt = next.createdAt;
    next.status = "planned";
    next.startDate = shiftDate(draft.startDate, draft.recurrence);
    next.deadline = draft.deadline ? shiftDate(draft.deadline, draft.recurrence) : "";
    if (kind === "item") { next.currentProgress = 0; next.isDone = false; next.elapsedSeconds = 0; next.timerStartedAt = null; next.timeSessions = []; }
    if (kind === "task") next.items = (next.items || []).map((item) => { item.id = id(); item.status = "planned"; item.currentProgress = 0; item.isDone = false; item.elapsedSeconds = 0; item.timerStartedAt = null; item.timeSessions = []; return item; });
    findCollection(kind, ids).push(next);
  }

  await save();
  state.formWasEdited = false;
  closeForm();
}

function shiftDate(value, recurrence) {
  const date = dateValue(value) || new Date();
  const days = recurrence === "daily" ? 1 : recurrence === "weekly" ? 7 : 30;
  return dateInputValue(addDays(date, days).toISOString());
}

async function deleteProject(projectId) {
  const project = findProject(projectId);
  if (!project) return;
  if (!await askConfirmation("Delete project?", "This removes the project, tasks, and items.")) return;
  state.projects = state.projects.filter((entry) => entry.id !== projectId);
  state.openProjectIds.delete(projectId);
  showUndo("Project deleted", () => state.projects.push(project));
  await save();
  render();
}

async function deleteTask(projectId, taskId) {
  if (!await askConfirmation("Delete task?", "This removes the task and all its items.")) return;
  const project = findProject(projectId);
  if (!project) return;
  const task = findTask(projectId, taskId);
  project.tasks = project.tasks.filter((entry) => entry.id !== taskId);
  state.openTaskIds.delete(taskId);
  showUndo("Task deleted", () => project.tasks.push(task));
  await save();
  render();
}

async function deleteItem(projectId, taskId, itemId) {
  if (!await askConfirmation("Delete item?", "This item and its time records will be removed.")) return;
  const task = findTask(projectId, taskId);
  if (!task) return;
  const item = findItem(projectId, taskId, itemId);
  task.items = task.items.filter((entry) => entry.id !== itemId);
  state.openItemIds.delete(itemId);
  showUndo("Item deleted", () => task.items.push(item));
  await save();
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

function toggleItemTimer(item) {
  const now = Date.now();
  if (item.timerStartedAt) {
    const startedAt = item.timerStartedAt;
    const seconds = Math.max(0, (now - startedAt) / 1000);
    item.elapsedSeconds += seconds;
    item.timerStartedAt = null;
    item.timeSessions.push({ id: id(), date: dateInputValue(new Date(startedAt).toISOString()), startedAt, endedAt: now, seconds });
  } else {
    allItems().filter((entry) => entry !== item && entry.timerStartedAt).forEach((entry) => toggleItemTimer(entry));
    item.timerStartedAt = now;
  }
  item.updatedAt = nowISO();
  const parentProject = state.projects.find((project) => project.tasks.some((task) => task.items.includes(item)));
  if (parentProject) parentProject.updatedAt = item.updatedAt;
  save();
  render();
}

function askConfirmation(title, message) {
  return new Promise((resolve) => {
    state.confirmAction = resolve;
    els.confirmHeading.textContent = title;
    els.confirmMessage.textContent = message;
    els.acceptConfirmButton.textContent = title.toLowerCase().includes("replace") ? "Replace" : "Delete";
    els.confirmDialog.hidden = false;
    els.acceptConfirmButton.focus();
  });
}

function finishConfirmation(value) {
  const resolve = state.confirmAction;
  state.confirmAction = null;
  els.confirmDialog.hidden = true;
  resolve?.(value);
}

function showUndo(message, action) {
  state.undoAction = action;
  els.appToast.innerHTML = "";
  const label = document.createElement("span"); label.textContent = message;
  const button = document.createElement("button"); button.type = "button"; button.textContent = "Undo";
  button.addEventListener("click", () => { state.undoAction?.(); state.undoAction = null; els.appToast.hidden = true; save(); render(); });
  els.appToast.append(label, button); els.appToast.hidden = false;
  setTimeout(() => { if (els.appToast.hidden) return; els.appToast.hidden = true; state.undoAction = null; }, 6000);
}

function showToast(message) {
  els.appToast.textContent = message;
  els.appToast.hidden = false;
  setTimeout(() => { els.appToast.hidden = true; }, 3000);
}

function checkReminders(force = false) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const today = dateInputValue(new Date().toISOString());
  const due = allEntries().filter((entry) => entry.deadline === today && entry.status !== "completed" && entry.status !== "archived");
  if (!due.length) return;
  const reminderKey = `project-time-manager-reminded-${today}`;
  if (!force && localStorage.getItem(reminderKey)) return;
  localStorage.setItem(reminderKey, "true");
  new Notification("Project Time Manager", { body: `${due.length} item${due.length === 1 ? "" : "s"} due today.` });
}

function showProjects() {
  state.showingToday = false; state.showingDeadlines = false; state.showingGantt = false; state.showingAbout = false; state.detailsProjectId = null; state.form = null; closeMenu(); render();
}

function showToday() {
  state.showingToday = true; state.showingDeadlines = false; state.showingGantt = false; state.showingAbout = false; state.detailsProjectId = null; state.form = null; closeMenu(); render();
}

els.menuToggleButton.addEventListener("click", () => {
  state.menuOpen = !state.menuOpen;
  render();
});

els.quickAddButton.addEventListener("click", () => openForm("project", "create"));
els.searchInput.addEventListener("input", () => { state.search = els.searchInput.value; renderProjects(); });
els.statusFilter.addEventListener("change", () => { state.statusFilter = els.statusFilter.value; renderProjects(); });
els.priorityFilter.addEventListener("change", () => { state.priorityFilter = els.priorityFilter.value; renderProjects(); });
els.sortSelect.addEventListener("change", () => { state.sort = els.sortSelect.value; renderProjects(); });
els.refreshButton.addEventListener("click", async () => { await refreshProjectsFromStorage(); closeMenu(); render(); showToast("Data refreshed"); });
els.enableNotificationsButton.addEventListener("click", async () => {
  if (typeof Notification === "undefined") { showToast("Notifications are not supported here"); return; }
  const permission = await Notification.requestPermission();
  state.notificationsEnabled = permission === "granted";
  render();
  if (state.notificationsEnabled) checkReminders(true);
});
els.largeTextButton.addEventListener("click", () => { state.largeText = !state.largeText; localStorage.setItem("project-time-manager-large-text", String(state.largeText)); render(); });

els.menuBackdrop.addEventListener("click", () => {
  state.menuOpen = false;
  render();
});

els.addProjectButton.addEventListener("click", () => {
  closeMenu();
  openForm("project", "create");
});

els.showTodayButton.addEventListener("click", showToday);
els.closeTodayButton.addEventListener("click", showProjects);
els.mobileProjectsButton.addEventListener("click", showProjects);
els.mobileTodayButton.addEventListener("click", showToday);
els.mobileDeadlinesButton.addEventListener("click", () => els.showDeadlinesButton.click());
els.mobileMenuButton.addEventListener("click", () => { state.menuOpen = !state.menuOpen; render(); });
els.cancelConfirmButton.addEventListener("click", () => finishConfirmation(false));
els.acceptConfirmButton.addEventListener("click", () => finishConfirmation(true));
els.confirmDialog.addEventListener("click", (event) => { if (event.target === els.confirmDialog) finishConfirmation(false); });

els.showDeadlinesButton.addEventListener("click", async () => {
  await refreshProjectsFromStorage();
  closeMenu();
  state.showingDeadlines = true;
  state.detailsProjectId = null;
  state.showingGantt = false;
  state.showingAbout = false;
  state.showingToday = false;
  state.form = null;
  render();
});

els.showGanttButton.addEventListener("click", async () => {
  await refreshProjectsFromStorage();
  closeMenu();
  state.showingGantt = true;
  state.showingDeadlines = false;
  state.detailsProjectId = null;
  state.showingAbout = false;
  state.showingToday = false;
  state.form = null;
  render();
});

els.showAboutButton.addEventListener("click", async () => {
  await refreshProjectsFromStorage();
  closeMenu();
  state.showingAbout = true;
  state.showingGantt = false;
  state.showingDeadlines = false;
  state.detailsProjectId = null;
  state.form = null;
  state.showingToday = false;
  render();
});

els.closeDetailsButton.addEventListener("click", closeDetails);

els.closeDeadlinesButton.addEventListener("click", closeDeadlines);

els.closeGanttButton.addEventListener("click", closeGantt);

els.closeAboutButton.addEventListener("click", closeAbout);

els.formNoDeadline.addEventListener("change", updateDeadlineControl);

els.formDeadline.addEventListener("input", () => {
  els.formNoDeadline.checked = !els.formDeadline.value;
  updateDeadlineControl();
});

els.exportDataButton.addEventListener("click", () => {
  closeMenu();
  const blob = new Blob([JSON.stringify(createDataDocument(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `project-time-manager-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

els.importDataInput.addEventListener("change", async () => {
  const file = els.importDataInput.files?.[0];
  if (!file) return;

  try {
    const document = JSON.parse(await file.text());
    const importedProjects = readDataDocument(document);
    if (!await askConfirmation("Replace current data?", "Importing replaces the current projects on this device.")) return;
    state.projects = importedProjects;
    state.openProjectIds.clear();
    state.openTaskIds.clear();
    state.openItemIds.clear();
    await save();
    closeMenu();
    render();
  } catch {
    alert("Could not import this JSON file.");
  } finally {
    els.importDataInput.value = "";
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !state.menuOpen) return;
  state.menuOpen = false;
  render();
});

els.objectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  commitForm();
});

els.objectForm.addEventListener("input", () => { if (state.form) state.formWasEdited = true; });
els.objectForm.addEventListener("change", () => { if (state.form) state.formWasEdited = true; });

els.cancelFormButton.addEventListener("click", closeForm);

els.formDone.addEventListener("change", () => {
  if (!state.form || state.form.kind !== "item") return;
  const maxProgress = Math.max(1, Number(els.formMaxProgress.value) || 1);
  updateProgressSlider(els.formDone.checked ? maxProgress : 0, maxProgress);
});

els.formMaxProgress.addEventListener("input", () => {
  if (!state.form || state.form.kind !== "item") return;
  const maxProgress = Math.max(1, Number(els.formMaxProgress.value) || 1);
  updateProgressSlider(Math.min(Number(els.formCurrentProgress.value) || 0, maxProgress), maxProgress);
});

els.formCurrentProgress.addEventListener("input", () => {
  if (!state.form || state.form.kind !== "item") return;
  const currentProgress = Number(els.formCurrentProgress.value) || 0;
  const maxProgress = Math.max(1, Number(els.formMaxProgress.value) || 1);
  els.formCurrentProgressText.textContent = String(currentProgress);
  els.formDone.checked = currentProgress >= maxProgress;
});

els.decrementProgressButton.addEventListener("click", () => adjustProgress(-1));

els.incrementProgressButton.addEventListener("click", () => adjustProgress(1));

els.startStopTimerButton.addEventListener("click", () => {
  if (!state.form || state.form.kind !== "item") return;
  syncFormDraft();
  const item = state.form.draft;
  toggleItemTimer(item);
  renderForm();
});

els.resetTimerButton.addEventListener("click", () => {
  if (!state.form || state.form.kind !== "item") return;
  state.form.draft.elapsedSeconds = 0;
  state.form.draft.timerStartedAt = null;
  renderForm();
});

els.addManualTimeButton.addEventListener("click", () => {
  if (!state.form || state.form.kind !== "item") return;
  syncFormDraft();
  const minutes = Math.max(0, Number(els.manualMinutesInput.value) || 0);
  if (!minutes) return;
  const seconds = minutes * 60;
  const item = state.form.draft;
  item.elapsedSeconds += seconds;
  item.timeSessions.push({ id: id(), date: dateInputValue(new Date().toISOString()), startedAt: null, endedAt: null, seconds });
  item.updatedAt = nowISO();
  els.manualMinutesInput.value = "";
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

function updateProgressSlider(currentProgress, maxProgress) {
  const safeMax = Math.max(1, Number(maxProgress) || 1);
  const safeCurrent = Math.max(0, Math.min(safeMax, Number(currentProgress) || 0));
  els.formCurrentProgress.max = String(safeMax);
  els.formCurrentProgress.value = String(safeCurrent);
  els.formCurrentProgressText.textContent = String(safeCurrent);
  els.formDone.checked = safeCurrent >= safeMax;
}

function updateDeadlineControl() {
  els.formDeadline.disabled = els.formNoDeadline.checked;
  if (els.formNoDeadline.checked) {
    els.formDeadline.value = "";
  }
}

function adjustProgress(delta) {
  if (!state.form || state.form.kind !== "item") return;
  const maxProgress = Math.max(1, Number(els.formMaxProgress.value) || 1);
  const currentProgress = Number(els.formCurrentProgress.value) || 0;
  updateProgressSlider(currentProgress + delta, maxProgress);
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
  const running = allItems().some((item) => item.timerStartedAt) || (state.form?.kind === "item" && state.form.draft.timerStartedAt);
  if (running) {
    renderProjects();
    if (Date.now() - state.lastTimerSaveAt > 15000) {
      state.lastTimerSaveAt = Date.now();
      save();
    }
  }
  checkReminders();
}, 1000);

window.addEventListener("beforeunload", save);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

load().then(render);
