const DATA_SCHEMA_VERSION = 7;
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
  menuOpen: false,
  form: null,
  serverStorageAvailable: false,
  recorder: null,
  recordingChunks: [],
};

const els = {
  menuToggleButton: document.querySelector("#menuToggleButton"),
  menuBackdrop: document.querySelector("#menuBackdrop"),
  sidebar: document.querySelector("#sidebar"),
  addProjectButton: document.querySelector("#addProjectButton"),
  showDeadlinesButton: document.querySelector("#showDeadlinesButton"),
  showGanttButton: document.querySelector("#showGanttButton"),
  showAboutButton: document.querySelector("#showAboutButton"),
  storageStatus: document.querySelector("#storageStatus"),
  schemaStatus: document.querySelector("#schemaStatus"),
  projectCountStatus: document.querySelector("#projectCountStatus"),
  exportDataButton: document.querySelector("#exportDataButton"),
  importDataInput: document.querySelector("#importDataInput"),
  emptyState: document.querySelector("#emptyState"),
  listView: document.querySelector("#listView"),
  projectList: document.querySelector("#projectList"),
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
    notes: blankNotes(),
    tasks: [],
  };
}

function newTask(project) {
  const createdAt = nowISO();
  return { id: id(), title: `Task ${project.tasks.length + 1}`, createdAt, startDate: dateInputValue(createdAt), deadline: "", notes: blankNotes(), items: [] };
}

function newItem(task) {
  return {
    id: id(),
    title: `Item ${task.items.length + 1}`,
    createdAt: nowISO(),
    startDate: dateInputValue(nowISO()),
    deadline: "",
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
    notes: project.notes,
    tasks: (project.tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      createdAt: task.createdAt,
      startDate: task.startDate || dateInputValue(task.createdAt),
      deadline: task.deadline || "",
      notes: task.notes,
      items: (task.items || []).map((item) => ({
        id: item.id,
        title: item.title,
        createdAt: item.createdAt,
        startDate: item.startDate || dateInputValue(item.createdAt),
        deadline: item.deadline || "",
        isDone: item.isDone,
        currentProgress: item.currentProgress,
        maxProgress: item.maxProgress,
        notes: item.notes,
        elapsedSeconds: item.elapsedSeconds,
        timerStartedAt: item.timerStartedAt,
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
  const showingSecondaryPage = Boolean(state.form || state.detailsProjectId || state.showingDeadlines || state.showingGantt || state.showingAbout);
  document.body.classList.toggle("menu-open", state.menuOpen);
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
  renderProjects();
  renderAboutStatus();
  if (state.form) renderForm();
  if (state.detailsProjectId) renderDetails();
  if (state.showingDeadlines) renderDeadlines();
  if (state.showingGantt) renderGantt();
}

function renderAboutStatus() {
  els.storageStatus.textContent = state.serverStorageAvailable ? "data.json" : "Browser only";
  els.schemaStatus.textContent = `v${DATA_SCHEMA_VERSION}`;
  els.projectCountStatus.textContent = String(state.projects.length);
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
    meta: `${task.items.length} items | equal share`,
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
    meta: `${formatProgressCount(item)} | equal share | ${formatTime(itemElapsed(item))}`,
    progress: itemProgressRatio(item) * 100,
    open: isOpen,
    depth: 2,
    color: project.color,
    actions: [
      { label: "Edit", icon: "edit", className: "icon-action", onClick: () => openForm("item", "edit", { projectId: project.id, taskId: task.id, itemId: item.id }) },
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
    ["Progress", `${Math.round(projectProgress(project))}%`],
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
  project.tasks.forEach((task) => {
    itemCount += task.items.length;
    totalSeconds += task.items.reduce((sum, item) => sum + itemElapsed(item), 0);
  });
  return { taskCount: project.tasks.length, itemCount, totalSeconds };
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
    row.className = "deadline-row";
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
  labelHead.textContent = "Project / Task";
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

    line.append(label, timeline);
    els.ganttChart.append(line);
  });
}

function collectGanttRows() {
  const rows = [];
  state.projects.forEach((project) => {
    rows.push({
      kind: "Project",
      title: project.title,
      start: dateValue(project.startDate || project.createdAt),
      end: dateValue(project.deadline),
      progress: projectProgress(project),
      color: project.color,
    });
    project.tasks.forEach((task) => {
      rows.push({
        kind: "Task",
        title: task.title,
        start: dateValue(task.startDate || task.createdAt),
        end: dateValue(task.deadline),
        progress: taskProgress(task),
        color: project.color,
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
  els.formCreatedAt.value = dateInputValue(draft.createdAt);
  els.formStartDate.value = dateInputValue(draft.startDate || draft.createdAt);
  els.formDeadline.value = dateInputValue(draft.deadline);
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
  draft.createdAt = draft.createdAt || nowISO();
  draft.startDate = els.formStartDate.value || dateInputValue(draft.createdAt);
  draft.deadline = els.formNoDeadline.checked ? "" : (els.formDeadline.value || "");
  if (kind === "project") {
    draft.color = normalizeProjectColor(els.formProjectColor.value, draft.color || defaultProjectColor());
  }
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

  await save();
  closeForm();
}

async function deleteProject(projectId) {
  if (!confirm("Remove this project and all its tasks and items?")) return;
  state.projects = state.projects.filter((project) => project.id !== projectId);
  state.openProjectIds.delete(projectId);
  await save();
  render();
}

async function deleteTask(projectId, taskId) {
  if (!confirm("Remove this task and all its items?")) return;
  const project = findProject(projectId);
  if (!project) return;
  project.tasks = project.tasks.filter((task) => task.id !== taskId);
  state.openTaskIds.delete(taskId);
  await save();
  render();
}

async function deleteItem(projectId, taskId, itemId) {
  if (!confirm("Remove this item?")) return;
  const task = findTask(projectId, taskId);
  if (!task) return;
  task.items = task.items.filter((item) => item.id !== itemId);
  state.openItemIds.delete(itemId);
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

els.menuToggleButton.addEventListener("click", () => {
  state.menuOpen = !state.menuOpen;
  render();
});

els.menuBackdrop.addEventListener("click", () => {
  state.menuOpen = false;
  render();
});

els.addProjectButton.addEventListener("click", () => {
  closeMenu();
  openForm("project", "create");
});

els.showDeadlinesButton.addEventListener("click", async () => {
  await refreshProjectsFromStorage();
  closeMenu();
  state.showingDeadlines = true;
  state.detailsProjectId = null;
  state.showingGantt = false;
  state.showingAbout = false;
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
    if (!confirm("Importing will replace the current local data. Continue?")) return;
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

load().then(render);
