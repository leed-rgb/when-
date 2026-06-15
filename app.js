// State Management
let currentRoom = null;
let selectedSlots = new Set(); // Saved as "YYYY-MM-DD_HH:MM"
let isDragging = false;
let dragMode = true; // true = selecting, false = deselecting
let apiBase = window.location.origin;
let tokenClient = null;

// Fallback Mode: If the server is not running or we are on file:// protocol, use localStorage
let useLocalFallback = window.location.protocol === 'file:';
if (useLocalFallback) {
  console.log('Running from local file. Using localStorage database fallback.');
}

// DOM Elements
const views = {
  home: document.getElementById('view-home'),
  enter: document.getElementById('view-enter'),
  result: document.getElementById('view-result')
};

const forms = {
  createRoom: document.getElementById('create-room-form')
};

const elements = {
  roomName: document.getElementById('room-name'),
  startDate: document.getElementById('start-date'),
  endDate: document.getElementById('end-date'),
  startTime: document.getElementById('start-time'),
  endTime: document.getElementById('end-time'),
  btnCreateRoom: document.getElementById('btn-create-room'),
  
  roomCreatedCard: document.getElementById('room-created-card'),
  shareLinkInput: document.getElementById('share-link-input'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  linkGoRespond: document.getElementById('link-go-respond'),
  linkGoResult: document.getElementById('link-go-result'),
  
  enterRoomTitle: document.getElementById('enter-room-title'),
  userName: document.getElementById('user-name'),
  entryTimeGrid: document.getElementById('entry-time-grid'),
  btnSubmitTime: document.getElementById('btn-submit-time'),
  btnClearSelection: document.getElementById('btn-clear-selection'),
  linkSkipToResult: document.getElementById('link-skip-to-result'),
  
  resultRoomTitle: document.getElementById('result-room-title'),
  respondentsCount: document.getElementById('respondents-count'),
  respondentsList: document.getElementById('respondents-list'),
  resultTimeGrid: document.getElementById('result-time-grid'),
  recommendationList: document.getElementById('recommendation-list'),
  resultShareLink: document.getElementById('result-share-link'),
  btnResultCopyLink: document.getElementById('btn-result-copy-link'),
  linkGoBackRespond: document.getElementById('link-go-back-respond'),
  
  toast: document.getElementById('toast'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingText: document.getElementById('loading-text'),
  headerLogo: document.getElementById('header-logo'),
  
  // Google API Settings Elements
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  settingsModal: document.getElementById('settings-modal'),
  gClientId: document.getElementById('g-client-id'),
  gApiKey: document.getElementById('g-api-key'),
  btnSyncGoogle: document.getElementById('btn-sync-google')
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  initFormSelects();
  setupEventListeners();
  loadSettings();
  handleRouting();
  
  // Handle back/forward browser buttons
  window.addEventListener('hashchange', handleRouting);
});

// Populate Start/End Time dropdowns (00:00 to 24:00 with 30m steps)
function initFormSelects() {
  const selectStart = elements.startTime;
  const selectEnd = elements.endTime;
  
  selectStart.innerHTML = '';
  selectEnd.innerHTML = '';
  
  for (let h = 0; h <= 24; h++) {
    for (let m of [0, 30]) {
      if (h === 24 && m === 30) break; // Maximum 24:00
      
      const hourStr = String(h).padStart(2, '0');
      const minStr = String(m).padStart(2, '0');
      const timeVal = `${hourStr}:${minStr}`;
      
      // Populate Start Time (exclude 24:00)
      if (timeVal !== '24:00') {
        const optStart = document.createElement('option');
        optStart.value = timeVal;
        optStart.textContent = timeVal;
        if (timeVal === '09:00') optStart.selected = true;
        selectStart.appendChild(optStart);
      }
      
      // Populate End Time (exclude 00:00)
      if (timeVal !== '00:00') {
        const optEnd = document.createElement('option');
        optEnd.value = timeVal;
        optEnd.textContent = timeVal;
        if (timeVal === '22:00') optEnd.selected = true;
        selectEnd.appendChild(optEnd);
      }
    }
  }
  
  // Set default dates (start: today, end: today + 4 days)
  const today = new Date();
  const future = new Date();
  future.setDate(today.getDate() + 4);
  
  elements.startDate.value = formatDate(today);
  elements.endDate.value = formatDate(future);
  elements.startDate.min = formatDate(today);
  elements.endDate.min = formatDate(today);
  
  // Date validation rules
  elements.startDate.addEventListener('change', () => {
    elements.endDate.min = elements.startDate.value;
    if (elements.endDate.value < elements.startDate.value) {
      elements.endDate.value = elements.startDate.value;
    }
  });
}

function setupEventListeners() {
  // Logo click
  elements.headerLogo.addEventListener('click', () => {
    window.location.hash = '';
  });
  
  // Form submission
  forms.createRoom.addEventListener('submit', async (e) => {
    e.preventDefault();
    await createRoom();
  });
  
  // Copy link buttons
  elements.btnCopyLink.addEventListener('click', () => copyToClipboard(elements.shareLinkInput.value));
  elements.btnResultCopyLink.addEventListener('click', () => copyToClipboard(elements.resultShareLink.value));
  
  // Clear button for entry
  elements.btnClearSelection.addEventListener('click', () => {
    selectedSlots.clear();
    document.querySelectorAll('#entry-time-grid .grid-cell').forEach(cell => {
      cell.classList.remove('selected');
    });
  });
  
  // Time Submission
  elements.btnSubmitTime.addEventListener('click', async () => {
    await submitResponse();
  });
  
  // Google API Settings modal events
  elements.btnOpenSettings.addEventListener('click', openSettingsModal);
  elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
  elements.btnSaveSettings.addEventListener('click', saveSettings);
  
  // Close settings on outside click
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });
  
  // Google Calendar Sync Button
  elements.btnSyncGoogle.addEventListener('click', syncGoogleCalendar);
  
  // Global drag state handlers (for mouse selection safety)
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // Mobile drag selection touch listener
  document.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// ==================== GOOGLE API SETTINGS LOGIC ====================
function openSettingsModal() {
  elements.settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  elements.settingsModal.classList.add('hidden');
}

function saveSettings() {
  const clientId = elements.gClientId.value.trim();
  const apiKey = elements.gApiKey.value.trim();
  
  localStorage.setItem('google_client_id', clientId);
  localStorage.setItem('google_api_key', apiKey);
  
  closeSettingsModal();
  showToast('구글 API 설정이 저장되었습니다!');
  
  // Re-initialize tokenClient with new client id
  tokenClient = null;
}

function loadSettings() {
  const clientId = localStorage.getItem('google_client_id') || '';
  const apiKey = localStorage.getItem('google_api_key') || '';
  
  elements.gClientId.value = clientId;
  elements.gApiKey.value = apiKey;
}

// ==================== GOOGLE CALENDAR SYNC LOGIC ====================
function initGoogleOAuth(clientId, callback) {
  if (tokenClient) {
    // Update callback in case it has updated closures
    tokenClient.callback = callback;
    return;
  }

  if (window.google && window.google.accounts && window.google.accounts.oauth2) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      callback: callback
    });
  } else {
    alert('Google Identity Services SDK가 아직 로드되지 않았습니다. 잠시 후 다시 시도해 주세요.');
  }
}

function syncGoogleCalendar() {
  const clientId = localStorage.getItem('google_client_id');
  if (!clientId) {
    alert('Google Calendar 연동을 위해 먼저 우측 상단 ⚙️ 설정을 클릭해 Google Client ID를 등록해 주세요.');
    openSettingsModal();
    return;
  }
  
  showLoading('구글 계정 인증 요청 중...');
  
  const callback = async (response) => {
    if (response.error !== undefined) {
      hideLoading();
      alert('구글 계정 인증에 실패했습니다: ' + response.error);
      return;
    }
    
    showLoading('구글 캘린더에서 일정을 가져오는 중...');
    try {
      await fetchGoogleCalendarEvents(response.access_token);
    } catch (err) {
      console.error(err);
      alert('일정을 가져오는 도중 문제가 발생했습니다: ' + err.message);
    } finally {
      hideLoading();
    }
  };
  
  initGoogleOAuth(clientId, callback);
  
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    hideLoading();
  }
}

async function fetchGoogleCalendarEvents(accessToken) {
  const room = currentRoom;
  const timeSlots = generateTimeSlots(room.startTime, room.endTime);
  
  // Query Google Calendar API for events in meeting date range
  const timeMin = new Date(room.dates[0] + 'T00:00:00Z').toISOString();
  // Set timeMax to end of last date
  const lastDate = room.dates[room.dates.length - 1];
  const timeMax = new Date(lastDate + 'T23:59:59Z').toISOString();
  
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  
  if (!res.ok) {
    throw new Error(`Google Calendar API Error (Status ${res.status}): ${res.statusText}`);
  }
  
  const data = await res.json();
  const events = data.items || [];
  
  // Step 1: Pre-populate ALL grid slots as "selected" (free)
  selectedSlots.clear();
  room.dates.forEach(dateStr => {
    timeSlots.forEach(timeStr => {
      selectedSlots.add(`${dateStr}_${timeStr}`);
    });
  });
  
  let busySlotsCount = 0;
  
  // Step 2: Parse events and deselect overlapping slots
  events.forEach(event => {
    // Ignore canceled events and events marked as transparent (free time)
    if (event.status === 'cancelled' || event.transparency === 'transparent') {
      return;
    }
    
    let eventStart, eventEnd;
    
    if (event.start.date) {
      // All-day event
      const [sYr, sMon, sDay] = event.start.date.split('-').map(Number);
      eventStart = new Date(sYr, sMon - 1, sDay, 0, 0, 0, 0);
      
      const [eYr, eMon, eDay] = event.end.date.split('-').map(Number);
      eventEnd = new Date(eYr, eMon - 1, eDay, 0, 0, 0, 0);
    } else if (event.start.dateTime) {
      eventStart = new Date(event.start.dateTime);
      eventEnd = new Date(event.end.dateTime);
    } else {
      return; // No valid times
    }
    
    // Compare event against each grid slot
    room.dates.forEach(dateStr => {
      const [year, month, day] = dateStr.split('-').map(Number);
      
      timeSlots.forEach(timeStr => {
        const slotId = `${dateStr}_${timeStr}`;
        const [sh, sm] = timeStr.split(':').map(Number);
        
        // Slot bounds in user's local time
        const slotStart = new Date(year, month - 1, day, sh, sm, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
        
        // Check for overlap (event overlaps slot if eventStart < slotEnd and eventEnd > slotStart)
        if (eventStart < slotEnd && eventEnd > slotStart) {
          if (selectedSlots.has(slotId)) {
            selectedSlots.delete(slotId);
            busySlotsCount++;
          }
        }
      });
    });
  });
  
  // Step 3: Update DOM grid selection visually
  document.querySelectorAll('#entry-time-grid .grid-cell').forEach(cell => {
    const slotId = cell.dataset.slotId;
    if (selectedSlots.has(slotId)) {
      cell.classList.add('selected');
    } else {
      cell.classList.remove('selected');
    }
  });
  
  showToast(`구글 캘린더 연동 성공! 바쁜 시간대 ${busySlotsCount}개 슬롯을 제외했습니다.`);
}

// ==================== ROUTING & NAVIGATION ====================
async function handleRouting() {
  const hash = window.location.hash;
  
  // Hide success card on home load
  elements.roomCreatedCard.classList.add('hidden');
  forms.createRoom.classList.remove('hidden');
  forms.createRoom.reset();
  initFormSelects();
  
  // Reset scroll position
  window.scrollTo(0, 0);
  
  if (!hash || hash === '#/') {
    switchView('home');
  } else if (hash.startsWith('#/room/')) {
    const roomId = hash.replace('#/room/', '');
    const success = await loadRoomData(roomId);
    if (success) {
      switchView('enter');
      renderEntryGrid();
    } else {
      window.location.hash = '';
    }
  } else if (hash.startsWith('#/result/')) {
    const roomId = hash.replace('#/result/', '');
    const success = await loadRoomData(roomId);
    if (success) {
      switchView('result');
      renderResultDashboard();
    } else {
      window.location.hash = '';
    }
  } else {
    // Fallback
    switchView('home');
  }
}

function switchView(viewName) {
  Object.keys(views).forEach(key => {
    if (key === viewName) {
      views[key].classList.add('active');
    } else {
      views[key].classList.remove('active');
    }
  });
}

// ==================== LOCALSTORAGE FALLBACK DB ====================
function localCreateRoom(name, dates, startTime, endTime) {
  const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
  const roomData = {
    id: roomId,
    name,
    dates,
    startTime,
    endTime,
    responses: [],
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(`when_room_${roomId}`, JSON.stringify(roomData));
  return roomId;
}

function localGetRoom(roomId) {
  const raw = localStorage.getItem(`when_room_${roomId.toUpperCase()}`);
  return raw ? JSON.parse(raw) : null;
}

function localSaveResponse(roomId, userName, slots) {
  const room = localGetRoom(roomId);
  if (!room) return null;
  
  const trimmedName = userName.trim();
  const existingIdx = room.responses.findIndex(r => r.name.toLowerCase() === trimmedName.toLowerCase());
  
  if (existingIdx >= 0) {
    room.responses[existingIdx].slots = slots;
  } else {
    room.responses.push({
      name: trimmedName,
      slots
    });
  }
  
  localStorage.setItem(`when_room_${roomId.toUpperCase()}`, JSON.stringify(room));
  return room;
}

// ==================== API ACTIONS ====================
async function createRoom() {
  const name = elements.roomName.value.trim();
  const startDateVal = elements.startDate.value;
  const endDateVal = elements.endDate.value;
  const startTime = elements.startTime.value;
  const endTime = elements.endTime.value;
  
  if (startTime >= endTime) {
    alert('종료 시간은 시작 시간보다 늦어야 합니다.');
    return;
  }
  
  // Generate dates array
  const dates = [];
  let current = new Date(startDateVal);
  const end = new Date(endDateVal);
  
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  
  if (dates.length > 14) {
    alert('약속 기간은 최대 14일까지 지정할 수 있습니다.');
    return;
  }
  
  showLoading('방을 만드는 중...');
  
  let roomId = null;
  
  if (useLocalFallback) {
    roomId = localCreateRoom(name, dates, startTime, endTime);
    onRoomCreated(roomId);
  } else {
    try {
      const res = await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dates, startTime, endTime })
      });
      
      const data = await res.json();
      
      if (res.ok && data.roomId) {
        roomId = data.roomId;
        onRoomCreated(roomId);
      } else {
        console.warn('API creation failed. Falling back to local storage.');
        useLocalFallback = true;
        roomId = localCreateRoom(name, dates, startTime, endTime);
        onRoomCreated(roomId);
      }
    } catch (err) {
      console.warn('Server connection error. Falling back to local storage:', err);
      useLocalFallback = true;
      roomId = localCreateRoom(name, dates, startTime, endTime);
      onRoomCreated(roomId);
    }
  }
  
  hideLoading();
}

function onRoomCreated(roomId) {
  // Use file:// format or local path if we are in local file mode
  let baseUrl = window.location.origin + window.location.pathname;
  if (window.location.protocol === 'file:') {
    baseUrl = window.location.href.split('#')[0];
  }
  const roomUrl = `${baseUrl}#/room/${roomId}`;
  elements.shareLinkInput.value = roomUrl;
  
  // Update success card navigation links
  elements.linkGoRespond.href = `#/room/${roomId}`;
  elements.linkGoResult.href = `#/result/${roomId}`;
  
  forms.createRoom.classList.add('hidden');
  elements.roomCreatedCard.classList.remove('hidden');
  showToast('약속 방이 성공적으로 생성되었습니다!');
}

async function loadRoomData(roomId) {
  showLoading('약속 정보를 불러오는 중...');
  
  if (useLocalFallback) {
    const localRoom = localGetRoom(roomId);
    if (localRoom) {
      currentRoom = localRoom;
      hideLoading();
      return true;
    } else {
      hideLoading();
      alert('약속방을 찾을 수 없습니다.');
      return false;
    }
  } else {
    try {
      const res = await fetch(`${apiBase}/api/rooms/${roomId}`);
      if (res.ok) {
        currentRoom = await res.json();
        hideLoading();
        return true;
      } else {
        // Retry locally just in case
        const localRoom = localGetRoom(roomId);
        if (localRoom) {
          useLocalFallback = true;
          currentRoom = localRoom;
          hideLoading();
          return true;
        }
        hideLoading();
        alert('약속방을 찾을 수 없습니다.');
        return false;
      }
    } catch (err) {
      console.warn('API load failed. Trying local storage fallback.', err);
      const localRoom = localGetRoom(roomId);
      if (localRoom) {
        useLocalFallback = true;
        currentRoom = localRoom;
        hideLoading();
        return true;
      }
      hideLoading();
      alert('서버와 통신하는 중 문제가 발생했습니다.');
      return false;
    }
  }
}

async function submitResponse() {
  const name = elements.userName.value.trim();
  if (!name) {
    alert('이름을 입력해주세요.');
    elements.userName.focus();
    return;
  }
  
  showLoading('응답을 저장하는 중...');
  
  if (useLocalFallback) {
    const updatedRoom = localSaveResponse(currentRoom.id, name, Array.from(selectedSlots));
    if (updatedRoom) {
      currentRoom = updatedRoom;
      onSubmitSuccess(name);
    } else {
      alert('응답을 저장하는 데 실패했습니다.');
    }
  } else {
    try {
      const res = await fetch(`${apiBase}/api/rooms/${currentRoom.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slots: Array.from(selectedSlots)
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        currentRoom.responses = data.responses;
        onSubmitSuccess(name);
      } else {
        console.warn('API submission failed. Trying local fallback.');
        const updatedRoom = localSaveResponse(currentRoom.id, name, Array.from(selectedSlots));
        if (updatedRoom) {
          useLocalFallback = true;
          currentRoom = updatedRoom;
          onSubmitSuccess(name);
        } else {
          alert(data.error || '제출 오류가 발생했습니다.');
        }
      }
    } catch (err) {
      console.warn('Server connection error. Trying local fallback:', err);
      const updatedRoom = localSaveResponse(currentRoom.id, name, Array.from(selectedSlots));
      if (updatedRoom) {
        useLocalFallback = true;
        currentRoom = updatedRoom;
        onSubmitSuccess(name);
      } else {
        alert('제출 과정에서 서버 오류가 발생했습니다.');
      }
    }
  }
  
  hideLoading();
}

function onSubmitSuccess(name) {
  // Save name to localStorage for user's convenience later
  localStorage.setItem(`userName_${currentRoom.id}`, name);
  
  // Display success toast
  showToast('제출 완료! 결과 페이지로 이동합니다.');
  
  // Go to result view
  setTimeout(() => {
    window.location.hash = `#/result/${currentRoom.id}`;
  }, 800);
}

// ==================== TIME GRID BUILDERS ====================

// Generate half-hour slots array
function generateTimeSlots(startStr, endStr) {
  const slots = [];
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  
  let currentMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  
  while (currentMin < endMin) {
    const h = Math.floor(currentMin / 60);
    const m = currentMin % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    slots.push(timeStr);
    currentMin += 30; // 30m steps
  }
  
  return slots;
}

function renderEntryGrid() {
  const room = currentRoom;
  elements.enterRoomTitle.textContent = room.name;
  
  // Set direct links
  elements.linkSkipToResult.href = `#/result/${room.id}`;
  
  // Fill username if saved in local storage
  const savedName = localStorage.getItem(`userName_${room.id}`);
  if (savedName) {
    elements.userName.value = savedName;
    
    // Find user's existing response in currentRoom
    const existing = room.responses.find(r => r.name.toLowerCase() === savedName.toLowerCase());
    if (existing) {
      selectedSlots = new Set(existing.slots);
    } else {
      selectedSlots.clear();
    }
  } else {
    elements.userName.value = '';
    selectedSlots.clear();
  }
  
  buildInteractiveGrid(elements.entryTimeGrid, false);
}

function buildInteractiveGrid(gridContainer, isReadonly = false) {
  const room = currentRoom;
  const dates = room.dates;
  const timeSlots = generateTimeSlots(room.startTime, room.endTime);
  const numDays = dates.length;
  
  gridContainer.innerHTML = '';
  
  // 1. Grid structure css variables
  gridContainer.style.gridTemplateColumns = `80px repeat(${numDays}, 1fr)`;
  
  // 2. Add Corner header
  const corner = document.createElement('div');
  corner.className = 'grid-header-corner';
  corner.textContent = '시간';
  gridContainer.appendChild(corner);
  
  // 3. Add Date Headers
  dates.forEach(dateStr => {
    const dateObj = new Date(dateStr);
    const header = document.createElement('div');
    header.className = 'grid-header-date';
    
    const dayBadge = document.createElement('span');
    dayBadge.className = 'header-day';
    dayBadge.textContent = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
    
    const dayOfWeek = dateObj.toLocaleDateString('ko-KR', { weekday: 'short' });
    const wdayBadge = document.createElement('span');
    wdayBadge.className = `header-wday wday-${dayOfWeek === '토' ? 'sat' : dayOfWeek === '일' ? 'sun' : 'weekday'}`;
    wdayBadge.textContent = dayOfWeek;
    
    header.appendChild(dayBadge);
    header.appendChild(wdayBadge);
    gridContainer.appendChild(header);
  });
  
  // 4. Populate rows
  timeSlots.forEach((timeStr, rowIdx) => {
    // Add time label column
    const timeLabel = document.createElement('div');
    const isHour = timeStr.endsWith(':00');
    timeLabel.className = `grid-time-label ${isHour ? 'hour-mark' : ''}`;
    timeLabel.textContent = isHour ? timeStr : '';
    gridContainer.appendChild(timeLabel);
    
    // Add cells for each date
    dates.forEach(dateStr => {
      const cell = document.createElement('div');
      const slotId = `${dateStr}_${timeStr}`;
      
      cell.className = 'grid-cell';
      cell.dataset.slotId = slotId;
      cell.dataset.date = dateStr;
      cell.dataset.time = timeStr;
      
      // Visual split line for full hours
      if (timeStr.endsWith(':30')) {
        cell.classList.add('hour-cell');
      }
      
      if (!isReadonly) {
        // Highlight if already selected
        if (selectedSlots.has(slotId)) {
          cell.classList.add('selected');
        }
        
        // Drag events for desktop
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          isDragging = true;
          dragMode = !selectedSlots.has(slotId);
          toggleSlot(cell, slotId, dragMode);
        });
        
        cell.addEventListener('mouseenter', () => {
          if (isDragging) {
            toggleSlot(cell, slotId, dragMode);
          }
        });
      }
      
      gridContainer.appendChild(cell);
    });
  });
  
  // Drag handling helper for Touch devices (mobile)
  if (!isReadonly) {
    setupMobileDrag(gridContainer);
  }
}

function toggleSlot(cell, slotId, shouldSelect) {
  if (shouldSelect) {
    selectedSlots.add(slotId);
    cell.classList.add('selected');
  } else {
    selectedSlots.delete(slotId);
    cell.classList.remove('selected');
  }
}

// Touch swipe select logic for mobile
function setupMobileDrag(gridContainer) {
  let touchStartCell = null;
  
  gridContainer.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = target ? target.closest('.grid-cell') : null;
    
    if (cell && gridContainer.contains(cell)) {
      e.preventDefault();
      isDragging = true;
      const slotId = cell.dataset.slotId;
      dragMode = !selectedSlots.has(slotId);
      toggleSlot(cell, slotId, dragMode);
      touchStartCell = cell;
    }
  }, { passive: false });

  gridContainer.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = target ? target.closest('.grid-cell') : null;
    
    if (cell && gridContainer.contains(cell)) {
      const slotId = cell.dataset.slotId;
      toggleSlot(cell, slotId, dragMode);
    }
  }, { passive: false });
}

// ==================== RESULT & HEATMAP DASHBOARD ====================
function renderResultDashboard() {
  const room = currentRoom;
  elements.resultRoomTitle.textContent = room.name;
  
  // Set share link
  let baseUrl = window.location.origin + window.location.pathname;
  if (window.location.protocol === 'file:') {
    baseUrl = window.location.href.split('#')[0];
  }
  const roomUrl = `${baseUrl}#/room/${room.id}`;
  
  elements.resultShareLink.value = roomUrl;
  elements.linkGoBackRespond.href = `#/room/${room.id}`;
  
  // Respondents
  const respondents = room.responses || [];
  elements.respondentsCount.textContent = `${respondents.length}명`;
  
  // Populate respondents list
  elements.respondentsList.innerHTML = '';
  if (respondents.length === 0) {
    elements.respondentsList.innerHTML = '<span class="placeholder-text">아직 응답이 없습니다.</span>';
  } else {
    respondents.forEach(r => {
      const badge = document.createElement('span');
      badge.className = 'respondent-badge';
      badge.textContent = r.name;
      elements.respondentsList.appendChild(badge);
    });
  }
  
  // Render Heatmap Grid
  buildHeatmapGrid();
  
  // Analyze & Show Recommendations
  calculateRecommendations();
}

function buildHeatmapGrid() {
  const room = currentRoom;
  const dates = room.dates;
  const timeSlots = generateTimeSlots(room.startTime, room.endTime);
  const respondents = room.responses || [];
  const numDays = dates.length;
  const gridContainer = elements.resultTimeGrid;
  
  gridContainer.innerHTML = '';
  gridContainer.style.gridTemplateColumns = `80px repeat(${numDays}, 1fr)`;
  
  // 1. Corner
  const corner = document.createElement('div');
  corner.className = 'grid-header-corner';
  corner.textContent = '시간';
  gridContainer.appendChild(corner);
  
  // 2. Date Headers
  dates.forEach(dateStr => {
    const dateObj = new Date(dateStr);
    const header = document.createElement('div');
    header.className = 'grid-header-date';
    
    const dayBadge = document.createElement('span');
    dayBadge.className = 'header-day';
    dayBadge.textContent = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
    
    const dayOfWeek = dateObj.toLocaleDateString('ko-KR', { weekday: 'short' });
    const wdayBadge = document.createElement('span');
    wdayBadge.className = `header-wday wday-${dayOfWeek === '토' ? 'sat' : dayOfWeek === '일' ? 'sun' : 'weekday'}`;
    wdayBadge.textContent = dayOfWeek;
    
    header.appendChild(dayBadge);
    header.appendChild(wdayBadge);
    gridContainer.appendChild(header);
  });
  
  // Create mapping of slots to respondents who are available
  const slotMapping = {};
  respondents.forEach(r => {
    r.slots.forEach(slotId => {
      if (!slotMapping[slotId]) {
        slotMapping[slotId] = [];
      }
      slotMapping[slotId].push(r.name);
    });
  });
  
  // Tooltip holder
  let tooltip = document.getElementById('grid-active-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'grid-active-tooltip';
    tooltip.className = 'grid-tooltip hidden';
    document.body.appendChild(tooltip);
  }
  
  // 3. Rows
  timeSlots.forEach((timeStr, rowIdx) => {
    // Add Time column
    const timeLabel = document.createElement('div');
    const isHour = timeStr.endsWith(':00');
    timeLabel.className = `grid-time-label ${isHour ? 'hour-mark' : ''}`;
    timeLabel.textContent = isHour ? timeStr : '';
    gridContainer.appendChild(timeLabel);
    
    // Add Cells
    dates.forEach(dateStr => {
      const cell = document.createElement('div');
      const slotId = `${dateStr}_${timeStr}`;
      const availableNames = slotMapping[slotId] || [];
      const count = availableNames.length;
      
      cell.className = 'grid-cell heatmap-cell';
      cell.dataset.slotId = slotId;
      
      if (timeStr.endsWith(':30')) {
        cell.classList.add('hour-cell');
      }
      
      if (count > 0 && respondents.length > 0) {
        cell.classList.add('active-heat');
        const ratio = count / respondents.length;
        
        // Dynamic heat styling based on ratios
        // Uses primary violet color (#8b5cf6) with varying opacities
        cell.style.backgroundColor = `rgba(139, 92, 246, ${Math.max(0.12, ratio * 0.95)})`;
        
        // Show tooltip on hover
        cell.addEventListener('mouseenter', (e) => {
          const rect = cell.getBoundingClientRect();
          const dateObj = new Date(dateStr);
          const dateLabel = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${dateObj.toLocaleDateString('ko-KR', { weekday: 'short' })})`;
          
          tooltip.innerHTML = `
            <div class="tooltip-time">${dateLabel} ${timeStr}</div>
            <div class="tooltip-count">${count}명 가능 / ${respondents.length}명 중</div>
            <div class="tooltip-names">${availableNames.join(', ')}</div>
          `;
          
          tooltip.classList.remove('hidden');
          
          // Position tooltip
          tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
          tooltip.style.top = `${rect.top + window.scrollY}px`;
        });
        
        cell.addEventListener('mouseleave', () => {
          tooltip.classList.add('hidden');
        });
      }
      
      gridContainer.appendChild(cell);
    });
  });
}

// ==================== RECOMMENDATION ALGORITHM ====================
function calculateRecommendations() {
  const room = currentRoom;
  const respondents = room.responses || [];
  const listContainer = elements.recommendationList;
  
  listContainer.innerHTML = '';
  
  if (respondents.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-recommend">
        <span class="empty-icon">💡</span>
        <p>아직 응답이 없습니다. 약속 링크를 공유하여 일정을 입력받으세요!</p>
      </div>`;
    return;
  }
  
  const dates = room.dates;
  const timeSlots = generateTimeSlots(room.startTime, room.endTime);
  
  // Map of slotId -> list of available names
  const slotMapping = {};
  respondents.forEach(r => {
    r.slots.forEach(slotId => {
      if (!slotMapping[slotId]) {
        slotMapping[slotId] = [];
      }
      slotMapping[slotId].push(r.name);
    });
  });
  
  // Form groups of consecutive slots with identical availability profile on the same day
  const candidateBlocks = [];
  
  dates.forEach(dateStr => {
    let currentBlock = null;
    
    timeSlots.forEach((timeStr, idx) => {
      const slotId = `${dateStr}_${timeStr}`;
      const people = slotMapping[slotId] || [];
      const count = people.length;
      
      if (count === 0) {
        // End current block if it exists
        if (currentBlock) {
          candidateBlocks.push(currentBlock);
          currentBlock = null;
        }
        return;
      }
      
      // Calculate next time slot string
      const [h, m] = timeStr.split(':').map(Number);
      let nextM = m + 30;
      let nextH = h;
      if (nextM === 60) {
        nextM = 0;
        nextH += 1;
      }
      const endTimeStr = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
      
      if (!currentBlock) {
        currentBlock = {
          date: dateStr,
          startTime: timeStr,
          endTime: endTimeStr,
          people: [...people],
          count: count
        };
      } else {
        // Check if we can merge: consecutive and has SAME people available
        // (Allows displaying combined meeting windows like 10:00~12:00)
        const samePeople = currentBlock.people.length === people.length &&
                           currentBlock.people.every(p => people.includes(p));
        
        if (samePeople) {
          currentBlock.endTime = endTimeStr;
        } else {
          // Finish current block and start a new one
          candidateBlocks.push(currentBlock);
          currentBlock = {
            date: dateStr,
            startTime: timeStr,
            endTime: endTimeStr,
            people: [...people],
            count: count
          };
        }
      }
    });
    
    if (currentBlock) {
      candidateBlocks.push(currentBlock);
    }
  });
  
  // Sort candidate blocks:
  // 1. By count of respondents (descending)
  // 2. By duration of the block (descending)
  // 3. By start time chronologically (ascending)
  candidateBlocks.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    
    // Duration in minutes
    const durA = getDurationMinutes(a.startTime, a.endTime);
    const durB = getDurationMinutes(b.startTime, b.endTime);
    if (durB !== durA) {
      return durB - durA;
    }
    
    // Chronological order
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.startTime.localeCompare(b.startTime);
  });
  
  // Filter top 3 unique blocks
  const topRecommendations = candidateBlocks.slice(0, 3);
  
  if (topRecommendations.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-recommend">
        <span class="empty-icon">💡</span>
        <p>겹치는 시간대가 없습니다. 다른 시간을 설정하거나 참여인원을 늘려보세요.</p>
      </div>`;
    return;
  }
  
  topRecommendations.forEach((rec, idx) => {
    const dateObj = new Date(rec.date);
    const dateLabel = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${dateObj.toLocaleDateString('ko-KR', { weekday: 'short' })})`;
    
    const recItem = document.createElement('div');
    recItem.className = `recommend-item rank-${idx+1}-item`;
    
    const rankBadge = document.createElement('div');
    rankBadge.className = `recommend-rank rank-${idx+1}`;
    recItem.appendChild(rankBadge);
    
    // Use medal emojis for ranking
    if (idx === 0) rankBadge.textContent = '🥇';
    else if (idx === 1) rankBadge.textContent = '🥈';
    else if (idx === 2) rankBadge.textContent = '🥉';
    else rankBadge.textContent = idx + 1;
    
    const info = document.createElement('div');
    info.className = 'recommend-info';
    
    const timeStr = document.createElement('div');
    timeStr.className = 'recommend-time-str';
    timeStr.textContent = `${rec.startTime} ~ ${rec.endTime}`;
    
    const dateStr = document.createElement('div');
    dateStr.className = 'recommend-date-str';
    dateStr.textContent = dateLabel;
    
    info.appendChild(timeStr);
    info.appendChild(dateStr);
    
    const ratioBox = document.createElement('div');
    ratioBox.className = 'recommend-ratio-box';
    
    const ratio = document.createElement('div');
    ratio.className = 'recommend-ratio';
    ratio.textContent = `${rec.count}명 가능`;
    
    const participants = document.createElement('div');
    participants.className = 'recommend-participants';
    participants.textContent = rec.people.join(', ');
    
    ratioBox.appendChild(ratio);
    ratioBox.appendChild(participants);
    
    recItem.appendChild(info);
    recItem.appendChild(ratioBox);
    
    listContainer.appendChild(recItem);
  });
}

// ==================== UTILS & HELPERS ====================
function formatDate(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
}

function showToast(msg) {
  const toast = elements.toast;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  
  // Animation reset
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 2500);
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('클립보드에 링크가 복사되었습니다!');
    }).catch(err => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast('클립보드에 링크가 복사되었습니다!');
  } catch (err) {
    alert('링크 복사에 실패했습니다. 직접 복사해 주세요: ' + text);
  }
  document.body.removeChild(textArea);
}

function showLoading(text = '로딩 중...') {
  elements.loadingText.textContent = text;
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}
