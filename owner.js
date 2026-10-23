const pageRole = document.body.dataset.page;
const messageBox = document.getElementById('message');
const noticeForm = document.getElementById('noticeForm');
const visitorForm = document.getElementById('visitorForm');
const rentForm = document.getElementById('rentForm');

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
  if (user.role !== 'owner') {
    window.location.replace('/tenant.html');
    return false;
  }
  const welcome = document.getElementById('welcomeName');
  if (welcome) welcome.textContent = `Hello, ${user.name}`;
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
let allComplaints = [];
let allVisitors = [];
let allRents = [];
let allTenants = [];

function updateCards() {
  const tenants = document.getElementById('tenantsCount');
  if (tenants) tenants.textContent = allTenants.length;
  const openComplaints = document.getElementById('openComplaintsCount');
  if (openComplaints) openComplaints.textContent = allComplaints.filter((c) => c.status !== 'Resolved').length;
  const inside = document.getElementById('visitorsInsideCount');
  if (inside) inside.textContent = allVisitors.filter((v) => !v.outTime).length;
  const unpaid = document.getElementById('unpaidRentsCount');
  if (unpaid) unpaid.textContent = allRents.filter((r) => r.status === 'Unpaid').length;
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
  card.append(element('p', 'issue-reporter', `Reported by ${complaint.tenantName || 'Tenant'}`));
  const controls = element('div', 'status-controls');
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Status for ${complaint.title}`);
  for (const optionStatus of ['Reported', 'In Progress', 'Resolved']) {
    const option = element('option', '', optionStatus);
    option.value = optionStatus;
    option.selected = optionStatus === status;
    select.append(option);
  }
  const saveButton = element('button', 'button small-button', 'Save status');
  saveButton.type = 'button';
  saveButton.addEventListener('click', () => updateComplaintStatus(complaint._id, select.value, saveButton));
  controls.append(select, saveButton);
  card.append(controls);
  return card;
}

async function updateComplaintStatus(id, status, button) {
  button.disabled = true;
  showMessage('');
  try {
    const response = await fetch(`/api/owner/complaints/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not update status.');
    showMessage('Complaint status updated.', 'success');
    await loadAll();
  } catch (error) {
    showMessage(error.message || 'Could not update status.');
  } finally {
    button.disabled = false;
  }
}

async function loadComplaints() {
  const list = document.getElementById('complaintsList');
  try {
    const response = await fetch('/api/owner/complaints');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load complaints.');
    allComplaints = data;
    list.replaceChildren();
    if (!data.length) { list.append(element('p', 'muted empty-state', 'No complaints have been submitted yet.')); }
    for (const complaint of data) list.append(makeComplaintCard(complaint));
  } catch (error) {
    list.replaceChildren(element('p', 'message error', error.message || 'Could not load complaints.'));
  }
}

// ---------- notices ----------
function makeNoticeCard(notice) {
  const card = element('article', 'issue-card');
  const heading = element('div', 'issue-heading');
  heading.append(element('h3', '', notice.title));
  const deleteButton = element('button', 'button outline small-button', 'Delete');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', () => deleteNotice(notice._id, deleteButton));
  heading.append(deleteButton);
  card.append(heading);
  card.append(element('p', 'issue-description', notice.body));
  card.append(element('p', 'issue-meta', `Posted by ${notice.ownerName} · ${formatDateTime(notice.createdAt)}`));
  return card;
}

async function deleteNotice(id, button) {
  button.disabled = true;
  showMessage('');
  try {
    const response = await fetch(`/api/notices/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not delete the notice.');
    showMessage('Notice deleted.', 'success');
    await loadAll();
  } catch (error) {
    showMessage(error.message || 'Could not delete the notice.');
    button.disabled = false;
  }
}

if (noticeForm) {
  noticeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!noticeForm.reportValidity()) return;
    const button = noticeForm.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('');
    try {
      const response = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('noticeTitle').value.trim(),
          body: document.getElementById('noticeBody').value.trim()
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not post the notice.');
      noticeForm.reset();
      showMessage('Notice posted successfully.', 'success');
      await loadAll();
    } catch (error) {
      showMessage(error.message || 'Could not post the notice.');
    } finally {
      button.disabled = false;
    }
  });
}

async function loadNotices() {
  const list = document.getElementById('noticesList');
  try {
    const response = await fetch('/api/notices');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load notices.');
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
  if (!visitor.outTime) {
    const controls = element('div', 'status-controls');
    const checkoutButton = element('button', 'button small-button', 'Check out');
    checkoutButton.type = 'button';
    checkoutButton.addEventListener('click', () => checkoutVisitor(visitor._id, checkoutButton));
    controls.append(checkoutButton);
    card.append(controls);
  }
  return card;
}

async function checkoutVisitor(id, button) {
  button.disabled = true;
  showMessage('');
  try {
    const response = await fetch(`/api/owner/visitors/${encodeURIComponent(id)}/checkout`, { method: 'PATCH' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not check out the visitor.');
    showMessage('Visitor checked out.', 'success');
    await loadAll();
  } catch (error) {
    showMessage(error.message || 'Could not check out the visitor.');
    button.disabled = false;
  }
}

if (visitorForm) {
  visitorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!visitorForm.reportValidity()) return;
    const button = visitorForm.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('');
    try {
      const response = await fetch('/api/owner/visitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorName: document.getElementById('visitorName').value.trim(),
          phone: document.getElementById('visitorPhone').value.trim(),
          room: document.getElementById('visitorRoom').value.trim(),
          purpose: document.getElementById('visitorPurpose').value.trim()
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not log the visitor.');
      visitorForm.reset();
      showMessage('Visitor entry logged.', 'success');
      await loadAll();
    } catch (error) {
      showMessage(error.message || 'Could not log the visitor.');
    } finally {
      button.disabled = false;
    }
  });
}

async function loadVisitors() {
  const list = document.getElementById('visitorsList');
  try {
    const response = await fetch('/api/owner/visitors');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load the visitor log.');
    allVisitors = data;
    list.replaceChildren();
    if (!data.length) { list.append(element('p', 'muted empty-state', 'No visitors have been logged yet.')); }
    for (const visitor of data) list.append(makeVisitorCard(visitor));
  } catch (error) {
    list.replaceChildren(element('p', 'message error', error.message || 'Could not load the visitor log.'));
  }
}

// ---------- rent tracker ----------
function makeRentCard(rent) {
  const card = element('article', 'issue-card');
  const heading = element('div', 'issue-heading');
  heading.append(element('h3', '', `${rent.tenantName} · Room ${rent.room || '-'}`));
  heading.append(element('span', `status-badge ${rent.status === 'Paid' ? 'status-paid' : 'status-unpaid'}`, rent.status));
  card.append(heading);
  card.append(element('p', 'issue-meta', `Month: ${rent.month} · Amount: ₹${rent.amount}`));
  if (rent.paidAt) card.append(element('p', 'issue-meta', `Paid on ${formatDateTime(rent.paidAt)}`));
  const controls = element('div', 'status-controls');
  const toggleButton = element('button', 'button small-button', rent.status === 'Paid' ? 'Mark as Unpaid' : 'Mark as Paid');
  toggleButton.type = 'button';
  toggleButton.addEventListener('click', () => toggleRentStatus(rent._id, rent.status === 'Paid' ? 'Unpaid' : 'Paid', toggleButton));
  controls.append(toggleButton);
  card.append(controls);
  return card;
}

async function toggleRentStatus(id, status, button) {
  button.disabled = true;
  showMessage('');
  try {
    const response = await fetch(`/api/owner/rents/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not update rent status.');
    showMessage('Rent status updated.', 'success');
    await loadAll();
  } catch (error) {
    showMessage(error.message || 'Could not update rent status.');
    button.disabled = false;
  }
}

if (rentForm) {
  const monthInput = document.getElementById('rentMonth');
  if (monthInput) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  rentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!rentForm.reportValidity()) return;
    const button = rentForm.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('');
    try {
      const response = await fetch('/api/owner/rents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: document.getElementById('rentMonth').value,
          amount: Number(document.getElementById('rentAmount').value)
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not generate rent entries.');
      showMessage(result.message || 'Rent entries generated.', 'success');
      await loadAll();
    } catch (error) {
      showMessage(error.message || 'Could not generate rent entries.');
    } finally {
      button.disabled = false;
    }
  });
}

async function loadRents() {
  const list = document.getElementById('rentsList');
  try {
    const response = await fetch('/api/owner/rents');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load rent records.');
    allRents = data;
    list.replaceChildren();
    if (!data.length) { list.append(element('p', 'muted empty-state', 'No rent records yet. Use the form above to generate them.')); }
    for (const rent of data) list.append(makeRentCard(rent));
  } catch (error) {
    list.replaceChildren(element('p', 'message error', error.message || 'Could not load rent records.'));
  }
}

// ---------- tenants ----------
async function loadTenants() {
  const list = document.getElementById('tenantsList');
  try {
    const response = await fetch('/api/owner/tenants');
    if (response.status === 401) { window.location.replace('/'); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load tenants.');
    allTenants = data;
    list.replaceChildren();
    if (!data.length) { list.append(element('p', 'muted empty-state', 'No tenant accounts yet.')); }
    for (const tenant of data) {
      const line = element('article', 'issue-card');
      const heading = element('div', 'issue-heading');
      heading.append(element('h3', '', tenant.name));
      heading.append(element('span', 'status-badge status-out', `Room ${tenant.room || '-'}`));
      line.append(heading);
      line.append(element('p', 'issue-meta', `${tenant.email} · Joined ${formatDateTime(tenant.createdAt)}`));
      list.append(line);
    }
  } catch (error) {
    list.replaceChildren(element('p', 'message error', error.message || 'Could not load tenants.'));
  }
}

async function loadAll() {
  await Promise.all([loadComplaints(), loadNotices(), loadVisitors(), loadRents(), loadTenants()]);
  updateCards();
}

checkAccess().then((allowed) => {
  if (allowed) return loadAll();
}).catch((error) => {
  showMessage(error.message || 'Could not check your sign-in status.');
});
