// ====== Anti-inspect & DevTools protection ======
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) e.preventDefault();
  if (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J')) e.preventDefault();
  if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'C')) e.preventDefault();
});
(function() {
  const element = new Image();
  Object.defineProperty(element, 'id', { get: function() { window.location.href = 'about:blank'; } });
  console.log(element);
}());

// ====== Configuration ======
const API_BASE = '/api';

// ====== State ======
const adminPassword = 'admin123'; // hardcoded
let currentAdminPassword = null;
let specialistToken = null;
let allSpecialists = [];
let allSchedules = [];
let allSlots = [];

// ====== Helper to call API ======
async function apiCall(url, options = {}) {
  const res = await fetch(API_BASE + url, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

// ====== Show/hide sections ======
function showPublicView() {
  document.getElementById('public-view').classList.remove('hidden');
  document.getElementById('admin-dashboard').classList.add('hidden');
  document.getElementById('specialist-dashboard').classList.add('hidden');
}
function showAdminDashboard() {
  document.getElementById('public-view').classList.add('hidden');
  document.getElementById('admin-dashboard').classList.remove('hidden');
  document.getElementById('specialist-dashboard').classList.add('hidden');
  loadAdminSpecialists(); // default tab
}
function showSpecialistDashboard() {
  document.getElementById('public-view').classList.add('hidden');
  document.getElementById('admin-dashboard').classList.add('hidden');
  document.getElementById('specialist-dashboard').classList.remove('hidden');
  loadSpecialistReservations();
}

// ====== Public tab switching ======
document.getElementById('tab-booking').addEventListener('click', () => {
  document.getElementById('booking-section').classList.remove('hidden');
  document.getElementById('admin-login-section').classList.add('hidden');
  document.getElementById('specialist-login-section').classList.add('hidden');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-booking').classList.add('active');
});
document.getElementById('tab-admin').addEventListener('click', () => {
  document.getElementById('booking-section').classList.add('hidden');
  document.getElementById('admin-login-section').classList.remove('hidden');
  document.getElementById('specialist-login-section').classList.add('hidden');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-admin').classList.add('active');
});
document.getElementById('tab-specialist').addEventListener('click', () => {
  document.getElementById('booking-section').classList.add('hidden');
  document.getElementById('admin-login-section').classList.add('hidden');
  document.getElementById('specialist-login-section').classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-specialist').classList.add('active');
});

// ====== Load specialists for booking ======
async function loadSpecialists() {
  const data = await apiCall('/specialists');
  allSpecialists = data;
  const select = document.getElementById('specialist-select');
  select.innerHTML = '<option value="">اختر الأخصائي</option>';
  data.forEach(s => {
    select.innerHTML += `<option value="${s.id}">${s.name}${s.specialty ? ' - ' + s.specialty : ''}</option>`;
  });
}

// ====== Load schedules for selected specialist (booking) ======
document.getElementById('specialist-select').addEventListener('change', async function() {
  const specialistId = this.value;
  const dateSelect = document.getElementById('date-select');
  const timeSelect = document.getElementById('time-select');
  dateSelect.innerHTML = '<option value="">اختر التاريخ</option>';
  timeSelect.innerHTML = '<option value="">اختر الساعة</option>';
  if (!specialistId) return;

  try {
    const scheds = await apiCall(`/schedules?specialist_id=${specialistId}`);
    dateSelect.innerHTML = '<option value="">اختر التاريخ</option>';
    scheds.forEach(s => {
      dateSelect.innerHTML += `<option value="${s.id}">${s.date}</option>`;
    });
  } catch (e) {
    alert('خطأ في تحميل الجداول: ' + e.message);
  }
});

// ====== Load available slots for selected schedule (booking) ======
document.getElementById('date-select').addEventListener('change', async function() {
  const scheduleId = this.value;
  const timeSelect = document.getElementById('time-select');
  timeSelect.innerHTML = '<option value="">اختر الساعة</option>';
  if (!scheduleId) return;

  try {
    const slots = await apiCall(`/slots?schedule_id=${scheduleId}&available=1`);
    timeSelect.innerHTML = '<option value="">اختر الساعة</option>';
    slots.forEach(slot => {
      timeSelect.innerHTML += `<option value="${slot.id}">${slot.start_time}</option>`;
    });
  } catch (e) {
    alert('خطأ في تحميل الأوقات: ' + e.message);
  }
});

// ====== Submit booking ======
document.getElementById('booking-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const msg = document.getElementById('booking-msg');
  msg.textContent = 'جاري الحجز...';

  const slotId = document.getElementById('time-select').value;
  if (!slotId) return msg.textContent = 'الرجاء اختيار الساعة';

  // Convert file to base64 if provided
  let letterBase64 = null;
  const fileInput = document.getElementById('letter');
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    letterBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const body = {
    slot_id: slotId,
    nin: document.getElementById('nin').value.trim(),
    first_name: document.getElementById('first-name').value.trim(),
    last_name: document.getElementById('last-name').value.trim(),
    dob: document.getElementById('dob').value,
    letter_base64: letterBase64
  };

  try {
    await apiCall('/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    msg.textContent = 'تم الحجز بنجاح!';
    document.getElementById('booking-form').reset();
    // reload slots
    document.getElementById('date-select').dispatchEvent(new Event('change'));
  } catch (err) {
    msg.textContent = 'فشل الحجز: ' + err.message;
  }
});

// ====== Admin Login ======
document.getElementById('admin-login-btn').addEventListener('click', () => {
  const pass = document.getElementById('admin-password').value.trim();
  const msg = document.getElementById('admin-login-msg');
  if (pass === adminPassword) {
    currentAdminPassword = pass;
    showAdminDashboard();
  } else {
    msg.textContent = 'كلمة المرور غير صحيحة';
    msg.className = 'text-red-600 text-sm mt-2';
  }
});

// ====== Admin Logout ======
document.getElementById('admin-logout').addEventListener('click', () => {
  currentAdminPassword = null;
  showPublicView();
  document.getElementById('admin-password').value = '';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-booking').classList.add('active');
  document.getElementById('booking-section').classList.remove('hidden');
  document.getElementById('admin-login-section').classList.add('hidden');
  document.getElementById('specialist-login-section').classList.add('hidden');
});

// ====== Admin Dashboard tabs ======
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
      b.classList.remove('bg-cyan-600', 'text-white');
      b.classList.add('bg-gray-200');
    });
    this.classList.add('bg-cyan-600', 'text-white');
    this.classList.remove('bg-gray-200');
    const tab = this.dataset.tab;
    if (tab === 'specialists') loadAdminSpecialists();
    else if (tab === 'schedules') loadAdminSchedules();
    else if (tab === 'reservations') loadAdminReservations();
    else if (tab === 'generate-token') loadGenerateToken();
  });
});

async function loadAdminSpecialists() {
  const content = document.getElementById('admin-content');
  try {
    const data = await apiCall('/specialists', { headers: { 'x-admin-password': currentAdminPassword } });
    allSpecialists = data;
    let html = `<h3 class="text-lg font-bold mb-4">قائمة الأخصائيين</h3>`;
    html += `<button onclick="showSpecialistForm()" class="bg-cyan-600 text-white px-4 py-2 rounded mb-4">إضافة أخصائي</button>`;
    html += `<div class="overflow-x-auto"><table class="w-full border"><thead><tr class="bg-gray-100"><th class="p-2 border">الاسم</th><th class="p-2 border">التخصص</th><th class="p-2 border">إجراءات</th></tr></thead><tbody>`;
    data.forEach(s => {
      html += `<tr><td class="p-2 border">${s.name}</td><td class="p-2 border">${s.specialty || ''}</td><td class="p-2 border">
        <button onclick="editSpecialist(${s.id}, '${s.name}', '${s.specialty || ''}')" class="text-blue-600 mr-2">تعديل</button>
        <button onclick="deleteSpecialist(${s.id})" class="text-red-600">حذف</button>
      </td></tr>`;
    });
    html += `</tbody></table></div>`;
    html += `<div id="specialist-form-container" class="mt-4"></div>`;
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<p class="text-red-600">خطأ: ${e.message}</p>`;
  }
}

function showSpecialistForm(id = null, name = '', specialty = '') {
  const container = document.getElementById('specialist-form-container');
  const isEdit = id !== null;
  container.innerHTML = `
    <form onsubmit="saveSpecialist(event, ${id})" class="space-y-3 bg-gray-50 p-4 rounded">
      <input type="text" id="s-name" value="${name}" placeholder="الاسم" required class="w-full border p-2 rounded" />
      <input type="text" id="s-specialty" value="${specialty}" placeholder="التخصص" class="w-full border p-2 rounded" />
      <button type="submit" class="bg-cyan-600 text-white px-4 py-2 rounded">${isEdit ? 'تعديل' : 'إضافة'}</button>
      <button type="button" onclick="loadAdminSpecialists()" class="bg-gray-300 px-4 py-2 rounded">إلغاء</button>
    </form>
  `;
}

async function saveSpecialist(e, id) {
  e.preventDefault();
  const name = document.getElementById('s-name').value.trim();
  const specialty = document.getElementById('s-specialty').value.trim();
  try {
    if (id) {
      await apiCall(`/specialists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': currentAdminPassword },
        body: JSON.stringify({ name, specialty })
      });
    } else {
      await apiCall('/specialists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': currentAdminPassword },
        body: JSON.stringify({ name, specialty })
      });
    }
    loadAdminSpecialists();
  } catch (e) {
    alert('خطأ: ' + e.message);
  }
}

async function editSpecialist(id, name, specialty) {
  showSpecialistForm(id, name, specialty);
}

async function deleteSpecialist(id) {
  if (!confirm('هل أنت متأكد من حذف الأخصائي؟')) return;
  try {
    await apiCall(`/specialists/${id}`, { method: 'DELETE', headers: { 'x-admin-password': currentAdminPassword } });
    loadAdminSpecialists();
  } catch (e) {
    alert('خطأ: ' + e.message);
  }
}

// ... (the rest of the admin functions: loadAdminSchedules, showScheduleForm, saveSchedule, deleteSchedule,
// loadAdminReservations, deleteReservation, loadGenerateToken, generateToken)
// Paste the exact same code from the previous answer for these functions.

// ====== Specialist Login / Logout ======
document.getElementById('specialist-login-btn').addEventListener('click', async () => {
  const token = document.getElementById('specialist-token').value.trim();
  const msg = document.getElementById('specialist-login-msg');
  if (!token) return msg.textContent = 'الرجاء إدخال الرمز';
  try {
    const data = await apiCall(`/specialist-reservations?token=${encodeURIComponent(token)}`);
    if (data.error) throw new Error(data.error);
    specialistToken = token;
    showSpecialistDashboard();
  } catch (e) {
    msg.textContent = 'الرمز غير صحيح أو منتهي الصلاحية';
    msg.className = 'text-red-600 text-sm mt-2';
  }
});

document.getElementById('specialist-logout').addEventListener('click', () => {
  specialistToken = null;
  showPublicView();
  document.getElementById('specialist-token').value = '';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-booking').classList.add('active');
  document.getElementById('booking-section').classList.remove('hidden');
  document.getElementById('specialist-login-section').classList.add('hidden');
  document.getElementById('admin-login-section').classList.add('hidden');
});

async function loadSpecialistReservations() {
  const container = document.getElementById('specialist-reservations');
  try {
    const data = await apiCall(`/specialist-reservations?token=${encodeURIComponent(specialistToken)}`);
    if (data.length === 0) {
      container.innerHTML = `<p>لا توجد حجوزات لهذا الأخصائي.</p>`;
      return;
    }
    let html = `<div class="overflow-x-auto"><table class="w-full border"><thead><tr class="bg-gray-100"><th class="p-2 border">المريض</th><th class="p-2 border">NIN</th><th class="p-2 border">تاريخ الميلاد</th><th class="p-2 border">التاريخ</th><th class="p-2 border">الساعة</th></tr></thead><tbody>`;
    data.forEach(r => {
      html += `<tr>
        <td class="p-2 border">${r.patient_first_name} ${r.patient_last_name}</td>
        <td class="p-2 border">${r.patient_nin}</td>
        <td class="p-2 border">${r.patient_dob}</td>
        <td class="p-2 border">${r.date}</td>
        <td class="p-2 border">${r.start_time}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p class="text-red-600">خطأ: ${e.message}</p>`;
  }
}

// ====== Initial load ======
loadSpecialists();