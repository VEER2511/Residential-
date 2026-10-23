const pageRole = document.body.dataset.page;
const messageBox = document.getElementById('message');
const complaintForm = document.getElementById('complaintForm');
const maximumImageSize = 2 * 1024 * 1024;
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

function showMessage(text, kind = 'error') {
  if (!messageBox) return;
  messageBox.textContent = text;
  messageBox.className = text ? `message ${kind}` : 'message';
}

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function checkAccess() {
  const response = await fetch('/api/auth/me');
  if (response.status === 401) {
    window.location.replace('/');
    return false;
  }
  if (!response.ok) throw new Error('Could not check your sign-in status.');
  const { user } = await response.json();
  if (user.role !== 'tenant') {
    window.location.replace('/owner.html');
    return false;
  }
  const welcome = document.getElementById('welcomeName');
  if (welcome) welcome.textContent = `Hello, ${user.name}`;
  const roomInput = document.getElementById('room');
  if (roomInput && user.room) roomInput.value = user.room;
  return true;
}

const logoutButton = document.querySelector('[data-logout]');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Could not log out. Please try again.');
      window.location.replace('/');
    } catch (error) {
      showMessage(error.message || 'Could not log out. Please try again.');
    }
  });
}

const refreshButton = document.getElementById('refreshAll');
if (refreshButton) refreshButton.addEventListener('click', loadAll);

// ---------- state for the summary cards ----------
let myComplaints = [];
let myNotices = [];
let myRents = [];

function updateCards() {
  const openComplaints = document.getElementById('openComplaintsCount');
  if (openComplaints) {
    openComplaints.textContent = myComplaints.filter((c) => c.status !== 'Resolved').length;
  }
  const rentStatus = document.getElementById('rentStatusText');
  if (rentStatus) {
    const current = myRents.find((r) => r.month === currentMonth());
    rentStatus.textContent = current ? `${current.status} · ₹${current.amount}` : 'Not generated';
  }
  const latestNotice = document.getElementById('latestNoticeText');
  if (latestNotice) {
    latestNotice.textContent = myNotices.length ? myNotices[0].title : 'No notices yet';
  }
}

// ---------- complaints ----------
function makeComplaintCard(complaint) {
  const card = element('article', 'issue-card');
  const heading = element('div', 'issue-heading');
  heading.append(element('h3', '', complaint.title));
  const status = typeof complaint.status === 'string' ? complaint.status : 'Reported';
  const statusClass = status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  heading.append(element('span', `status-badge status-${statusClass}`, status));
  card.append(heading);
  card.append(element('p', 'issue-meta', `${complaint.category} · Room ${complaint.room}`));
  card.append(element('p', 'issue-description', complaint.description));
  if (complaint.createdAt) card.append(element('p', 'issue-meta', `Submitted ${formatDateTime(complaint.createdAt)}`));
  if (typeof complaint.imageUrl === 'string' && (complaint.imageUrl.startsWith('uploads/') || complaint.imageUrl.startsWith('/uploads/'))) {
    const image = document.createElement('img');
    image.src = complaint.imageUrl.startsWith('/') ? complaint.imageUrl : `/${complaint.imageUrl}`;
    image.alt = `Photo attached to ${complaint.title}`;
    image.className = 'issue-image';
    card.append(image);
  }
  return card;
}

async function loadComplaints() {
  const list = document.getElementById('complaintsList');
  try {
    const response = await fetch('/api/tenant/complaints');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load your complaints.');
    myComplaints = data;
    list.replaceChildren();
    if (!data.length) { list.append(element('p', 'muted empty-state', 'You have not submitted any complaints yet.')); }
    for (const complaint of data) list.append(makeComplaintCard(complaint));
  } catch (error) {
    list.replaceChildren(element('p', 'message error', error.message || 'Could not load your complaints.'));
  }
}

// ---------- notices ----------
function makeNoticeCard(notice) {
  const card = element('article', 'issue-card');
  card.append(element('h3', '', notice.title));
  card.append(element('p', 'issue-description', notice.body));
  card.append(element('p', 'issue-meta', `Posted by ${notice.ownerName} · ${formatDateTime(notice.createdAt)}`));
  return card;
}

async function loadNotices() {
  const list = document.getElementById('noticesList');
  try {
    const response = await fetch('/api/notices');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load notices.');
    myNotices = data;
    list.replaceChildren();
    if (!data.length) { list.append(element('p', 'muted empty-state', 'No notices have been posted yet.')); }
    for (const notice of data) list.append(makeNoticeCard(notice));
  } catch (error) {
    list.replaceChildren(element('p', 'message error', error.message || 'Could not load notices.'));
  }
}

// ---------- visitors ----------
function makeVisitorCard(visitor) {
  const card = element('article', 'issue-card');
  const heading = element('div', 'issue-heading');
  heading.append(element('h3', '', visitor.visitorName));
  heading.append(element('span', `status-badge ${visitor.outTime ? 'status-out' : 'status-inside'}`, visitor.outTime ? 'Checked out' : 'Inside now'));
  card.append(heading);
  card.append(element('p', 'issue-meta', `${visitor.purpose} · Room ${visitor.room}${visitor.phone ? ` · ${visitor.phone}` : ''}`));
  card.append(element('p', 'issue-meta', `In: ${formatDateTime(visitor.inTime)} · Out: ${visitor.outTime ? formatDateTime(visitor.outTime) : '-'}`));
  return card;
}

async function loadVisitors() {
  const list = document.getElementById('visitorsList');
  try {
    const response = await fetch('/api/tenant/visitors');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load your visitors.');
    list.replaceChildren();
    if (!data.length) { list.append(element('p', 'muted empty-state', 'No visitors have been logged for your room.')); }
    for (const visitor of data) list.append(makeVisitorCard(visitor));
  } catch (error) {
    list.replaceChildren(element('p', 'message error', error.message || 'Could not load your visitors.'));
  }
}

// ---------- rent ----------
function makeRentCard(rent) {
  const card = element('article', 'issue-card');
  const heading = element('div', 'issue-heading');
  heading.append(element('h3', '', `Rent for ${rent.month}`));
  heading.append(element('span', `status-badge ${rent.status === 'Paid' ? 'status-paid' : 'status-unpaid'}`, rent.status));
  card.append(heading);
  card.append(element('p', 'issue-meta', `Amount: ₹${rent.amount}`));
  if (rent.paidAt) card.append(element('p', 'issue-meta', `Paid on ${formatDateTime(rent.paidAt)}`));
  return card;
}

async function loadRents() {
  const list = document.getElementById('rentsList');
  try {
    const response = await fetch('/api/tenant/rents');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load your rent records.');
    myRents = data;
    list.replaceChildren();
    if (!data.length) { list.append(element('p', 'muted empty-state', 'No rent records have been generated yet.')); }
    for (const rent of data) list.append(makeRentCard(rent));
  } catch (error) {
    list.replaceChildren(element('p', 'message error', error.message || 'Could not load your rent records.'));
  }
}

// ---------- complaint form ----------
function validateTextFields() {
  const fields = [
    ['title', 3, 100, 'Title must be between 3 and 100 characters.'],
    ['room', 1, 20, 'Room number must be between 1 and 20 characters.'],
    ['description', 10, 1000, 'Description must be between 10 and 1000 characters.']
  ];
  for (const [name, minimum, maximum, message] of fields) {
    const field = complaintForm.elements.namedItem(name);
    const length = field.value.trim().length;
    field.setCustomValidity(length < minimum || length > maximum ? message : '');
  }
  return complaintForm.reportValidity();
}

if (complaintForm) {
  for (const name of ['title', 'room', 'description']) {
    const input = complaintForm.elements.namedItem(name);
    if (input) input.addEventListener('input', (event) => event.currentTarget.setCustomValidity(''));
  }

  complaintForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateTextFields()) return;

    const fileInput = complaintForm.elements.namedItem('image');
    const file = fileInput.files[0];
    if (file && !allowedImageTypes.includes(file.type)) {
      showMessage('Only JPEG, PNG, or WebP images are allowed.');
      fileInput.focus();
      return;
    }
    if (file && file.size > maximumImageSize) {
      showMessage('Image must be 2 MB or smaller.');
      fileInput.focus();
      return;
    }

    const formData = new FormData(complaintForm);
    for (const name of ['title', 'category', 'room', 'description']) {
      formData.set(name, complaintForm.elements.namedItem(name).value.trim());
    }

    const button = complaintForm.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('');
    try {
      const response = await fetch('/api/tenant/complaints', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not submit your complaint.');
      complaintForm.reset();
      showMessage('Your complaint has been submitted.', 'success');
      await loadAll();
    } catch (error) {
      showMessage(error.message || 'Could not submit your complaint.');
    } finally {
      button.disabled = false;
    }
  });
}

async function loadAll() {
  await Promise.all([loadComplaints(), loadNotices(), loadVisitors(), loadRents()]);
  updateCards();
}

checkAccess().then((allowed) => {
  if (allowed) return loadAll();
}).catch((error) => {
  showMessage(error.message || 'Could not check your sign-in status.');
});
