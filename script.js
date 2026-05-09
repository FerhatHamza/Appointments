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
const adminPassword = 'admin123';
let currentAdminPassword = null;
let specialistToken = null;
let allSpecialists = [];
let currentReservations = [];
let currentSpecialistId = null;
let pendingBookingData = null;

// ====== NIN Validation (background) ======
function validateNIN(nin) {
  if (!/^\d{18}$/.test(nin)) return { valid: false, error: 'رقم التعريف يجب أن يتكون من 18 رقماً' };
  const genderCode = nin.substring(0, 3);
  const yearCode = nin.substring(3, 5);
  let gender = null;
  if (genderCode === '109') gender = 'male';
  else if (genderCode === '119') gender = 'female';
  else return { valid: false, error: 'رقم التعريف غير صالح' };
  const year = parseInt(yearCode);
  const birthYear = year >= 0 && year <= 26 ? 2000 + year : 1900 + year;
  return { valid: true, gender, birthYear };
}

function getAge(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function isArabic(text) {
  return /^[\u0600-\u06FF\s]+$/.test(text);
}

async function apiCall(url, options = {}) {
  const res = await fetch(API_BASE + url, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

// ====== View switching ======
function showPublicView() {
  document.getElementById('public-view').classList.remove('hidden');
  document.getElementById('admin-dashboard').classList.add('hidden');
  document.getElementById('specialist-dashboard').classList.add('hidden');
}
function showAdminDashboard() {
  document.getElementById('public-view').classList.add('hidden');
  document.getElementById('admin-dashboard').classList.remove('hidden');
  document.getElementById('specialist-dashboard').classList.add('hidden');
  document.getElementById('admin-login-overlay').classList.add('hidden');
  loadAdminSpecialists();
}
function showSpecialistDashboard() {
  document.getElementById('public-view').classList.add('hidden');
  document.getElementById('admin-dashboard').classList.add('hidden');
  document.getElementById('specialist-dashboard').classList.remove('hidden');
  document.getElementById('specialist-login-overlay').classList.add('hidden');
  loadSpecialistReservations();
}

// ====== Header login buttons ======
document.getElementById('header-admin-btn').addEventListener('click', () => {
  document.getElementById('admin-login-overlay').classList.remove('hidden');
});
document.getElementById('header-specialist-btn').addEventListener('click', () => {
  document.getElementById('specialist-login-overlay').classList.remove('hidden');
});

// ====== Load specialists ======
async function loadSpecialists() {
  const data = await apiCall('/specialists');
  allSpecialists = data;
  const select = document.getElementById('specialist-select');
  select.innerHTML = '<option value="">اختر الأخصائي</option>';
  data.forEach(s => {
    select.innerHTML += `<option value="${s.id}">${s.name}${s.specialty ? ' - ' + s.specialty : ''}</option>`;
  });
}

document.getElementById('specialist-select').addEventListener('change', async function() {
  const sid = this.value;
  const dateS = document.getElementById('date-select');
  const timeS = document.getElementById('time-select');
  dateS.innerHTML = '<option value="">اختر التاريخ</option>';
  timeS.innerHTML = '<option value="">اختر الساعة</option>';
  if (!sid) return;
  const scheds = await apiCall(`/schedules?specialist_id=${sid}`);
  scheds.forEach(s => dateS.innerHTML += `<option value="${s.id}">${s.date}</option>`);
});

document.getElementById('date-select').addEventListener('change', async function() {
  const schId = this.value;
  const timeS = document.getElementById('time-select');
  timeS.innerHTML = '<option value="">اختر الساعة</option>';
  if (!schId) return;
  const slots = await apiCall(`/slots?schedule_id=${schId}&available=1`);
  slots.forEach(s => timeS.innerHTML += `<option value="${s.id}">${s.start_time}</option>`);
});

// ====== Age -> show parent fields ======
document.getElementById('dob').addEventListener('change', function() {
  const age = getAge(this.value);
  const parentFields = document.querySelectorAll('.parent-fields');
  if (age < 18) {
    parentFields.forEach(f => f.classList.remove('hidden'));
    document.getElementById('parent-nin').required = true;
    document.getElementById('parent-first-name').required = true;
    document.getElementById('parent-last-name').required = true;
    document.getElementById('parent-dob').required = true;
  } else {
    parentFields.forEach(f => f.classList.add('hidden'));
    document.getElementById('parent-nin').required = false;
    document.getElementById('parent-first-name').required = false;
    document.getElementById('parent-last-name').required = false;
    document.getElementById('parent-dob').required = false;
  }
});

// ====== Input filters ======
document.querySelectorAll('.arabic-only').forEach(input => {
  input.addEventListener('input', function() {
    this.value = this.value.replace(/[^\u0600-\u06FF\s]/g, '');
  });
});
document.getElementById('nin').addEventListener('input', function() {
  this.value = this.value.replace(/[^0-9]/g, '');
});
document.getElementById('parent-nin').addEventListener('input', function() {
  this.value = this.value.replace(/[^0-9]/g, '');
});

// ====== Terms Modal ======
function showTermsModal(data) {
  pendingBookingData = data;
  document.getElementById('terms-overlay').classList.remove('hidden');
}
document.getElementById('terms-accept').addEventListener('click', () => {
  document.getElementById('terms-overlay').classList.add('hidden');
  if (pendingBookingData) submitBooking(pendingBookingData);
});
document.getElementById('terms-reject').addEventListener('click', () => {
  pendingBookingData = null;
  document.getElementById('terms-overlay').classList.add('hidden');
  document.getElementById('booking-msg').textContent = 'يجب الموافقة على الشروط لإتمام الحجز';
});

// ====== Submit booking form ======
document.getElementById('booking-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const msg = document.getElementById('booking-msg');
  msg.textContent = '';

  // Validate NIN
  const nin = document.getElementById('nin').value.trim();
  const ninCheck = validateNIN(nin);
  if (!ninCheck.valid) return msg.textContent = ninCheck.error;

  // Validate Arabic names
  const fname = document.getElementById('first-name').value.trim();
  const lname = document.getElementById('last-name').value.trim();
  if (!isArabic(fname) || !isArabic(lname)) return msg.textContent = 'الاسم واللقب يجب أن يكونا بالحروف العربية فقط';

  // DOB vs NIN year
  const dob = document.getElementById('dob').value;
  if (!dob) return msg.textContent = 'الرجاء إدخال تاريخ الميلاد';
  if (new Date(dob).getFullYear() !== ninCheck.birthYear) return msg.textContent = 'تاريخ الميلاد لا يتطابق مع رقم التعريف الوطني';

  // Age & parent
  const age = getAge(dob);
  if (age < 18) {
    const pnin = document.getElementById('parent-nin').value.trim();
    if (!/^\d{18}$/.test(pnin)) return msg.textContent = 'رقم تعريف ولي الأمر غير صالح';
    if (!isArabic(document.getElementById('parent-first-name').value.trim()) ||
        !isArabic(document.getElementById('parent-last-name').value.trim()))
      return msg.textContent = 'اسم ولقب ولي الأمر يجب أن يكونا بالحروف العربية';
    if (!document.getElementById('parent-dob').value) return msg.textContent = 'الرجاء إدخال تاريخ ميلاد ولي الأمر';
  }

  // Check previous reservation for this NIN (public only)
  try {
    const existing = await apiCall(`/check-reservation?nin=${encodeURIComponent(nin)}`);
    if (existing.count > 0) return msg.textContent = 'لديك حجز مسبق بالفعل';
  } catch {}

  const slotId = document.getElementById('time-select').value;
  if (!slotId) return msg.textContent = 'الرجاء اختيار الساعة';

  let letterBase64 = null;
  const file = document.getElementById('letter').files[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) return msg.textContent = 'حجم الصورة كبير جداً (الحد الأقصى 5 ميغابايت)';
    letterBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('فشل قراءة الملف'));
      reader.readAsDataURL(file);
    });
  }

  const body = {
    slot_id: slotId,
    nin,
    first_name: fname,
    last_name: lname,
    dob,
    letter_base64: letterBase64,
    parent_nin: document.getElementById('parent-nin')?.value || null,
    parent_first_name: document.getElementById('parent-first-name')?.value || null,
    parent_last_name: document.getElementById('parent-last-name')?.value || null,
    parent_dob: document.getElementById('parent-dob')?.value || null
  };
  showTermsModal(body);
});

async function submitBooking(data) {
  const msg = document.getElementById('booking-msg');
  msg.textContent = 'جاري الحجز...';
  try {
    await apiCall('/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    msg.textContent = 'تم الحجز بنجاح!';
    document.getElementById('booking-form').reset();
    document.getElementById('date-select').innerHTML = '<option value="">اختر التاريخ</option>';
    document.getElementById('time-select').innerHTML = '<option value="">اختر الساعة</option>';
    document.querySelectorAll('.parent-fields').forEach(f => f.classList.add('hidden'));
    pendingBookingData = null;
  } catch (err) {
    let e = err.message;
    try { e = JSON.parse(err.message).error || e; } catch (_) {}
    msg.textContent = 'فشل الحجز: ' + e;
  }
}

// ====== Admin Login ======
document.getElementById('admin-login-btn').addEventListener('click', () => {
  const pass = document.getElementById('admin-password').value.trim();
  if (pass === adminPassword) {
    currentAdminPassword = pass;
    showAdminDashboard();
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-login-msg').textContent = '';
  } else {
    document.getElementById('admin-login-msg').textContent = 'كلمة المرور غير صحيحة';
  }
});
document.getElementById('admin-logout').addEventListener('click', () => {
  currentAdminPassword = null;
  showPublicView();
});

// Admin tabs
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
      b.classList.remove('bg-cyan-600','text-white'); b.classList.add('bg-gray-200');
    });
    this.classList.add('bg-cyan-600','text-white'); this.classList.remove('bg-gray-200');
    const tab = this.dataset.tab;
    if (tab === 'specialists') loadAdminSpecialists();
    else if (tab === 'schedules') loadAdminSchedules();
    else if (tab === 'reservations') loadAdminReservations();
    else if (tab === 'generate-token') loadGenerateToken();
  });
});

// ... (Admin CRUD functions identical to previous full answer, I'll omit for brevity but they must be included as in prior full script.js)
// I will paste the whole admin & specialist sections now to avoid omission.

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
    html += `</tbody></table></div><div id="specialist-form-container" class="mt-4"></div>`;
    content.innerHTML = html;
  } catch (e) { content.innerHTML = `<p class="text-red-600">خطأ: ${e.message}</p>`; }
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
      await apiCall(`/specialists/${id}`, { method: 'PUT', headers: { 'Content-Type':'application/json', 'x-admin-password':currentAdminPassword }, body: JSON.stringify({name, specialty}) });
    } else {
      await apiCall('/specialists', { method: 'POST', headers: { 'Content-Type':'application/json', 'x-admin-password':currentAdminPassword }, body: JSON.stringify({name, specialty}) });
    }
    loadAdminSpecialists();
  } catch (e) { alert('خطأ: ' + e.message); }
}

async function editSpecialist(id, name, specialty) { showSpecialistForm(id, name, specialty); }
async function deleteSpecialist(id) {
  if (!confirm('هل أنت متأكد من حذف الأخصائي؟')) return;
  try {
    await apiCall(`/specialists/${id}`, { method: 'DELETE', headers: { 'x-admin-password': currentAdminPassword } });
    loadAdminSpecialists();
  } catch (e) { alert('خطأ: ' + e.message); }
}

async function loadAdminSchedules() {
  const content = document.getElementById('admin-content');
  try {
    const scheds = await apiCall('/schedules', { headers: { 'x-admin-password': currentAdminPassword } });
    let html = `<h3 class="text-lg font-bold mb-4">الجداول</h3>`;
    html += `<button onclick="showScheduleForm()" class="bg-cyan-600 text-white px-4 py-2 rounded mb-4">إضافة جدول</button>`;
    html += `<div class="overflow-x-auto"><table class="w-full border"><thead><tr class="bg-gray-100"><th class="p-2 border">الأخصائي</th><th class="p-2 border">التاريخ</th><th class="p-2 border">إجراءات</th></tr></thead><tbody>`;
    for (let s of scheds) {
      const spec = allSpecialists.find(sp => sp.id === s.specialist_id) || { name: 'غير معروف' };
      html += `<tr><td class="p-2 border">${spec.name}</td><td class="p-2 border">${s.date}</td><td class="p-2 border">
        <button onclick="deleteSchedule(${s.id})" class="text-red-600">حذف</button>
      </td></tr>`;
    }
    html += `</tbody></table></div><div id="schedule-form-container" class="mt-4"></div>`;
    content.innerHTML = html;
  } catch (e) { content.innerHTML = `<p class="text-red-600">خطأ: ${e.message}</p>`; }
}

function showScheduleForm() {
  const container = document.getElementById('schedule-form-container');
  let options = '';
  allSpecialists.forEach(s => options += `<option value="${s.id}">${s.name}</option>`);
  container.innerHTML = `
    <form onsubmit="saveSchedule(event)" class="space-y-3 bg-gray-50 p-4 rounded">
      <select id="sched-specialist" class="w-full border p-2 rounded">${options}</select>
      <input type="date" id="sched-date" required class="w-full border p-2 rounded" />
      <button type="submit" class="bg-cyan-600 text-white px-4 py-2 rounded">إضافة</button>
      <button type="button" onclick="loadAdminSchedules()" class="bg-gray-300 px-4 py-2 rounded">إلغاء</button>
    </form>
  `;
}

async function saveSchedule(e) {
  e.preventDefault();
  const specialist_id = document.getElementById('sched-specialist').value;
  const date = document.getElementById('sched-date').value;
  try {
    await apiCall('/schedules', { method: 'POST', headers: { 'Content-Type':'application/json', 'x-admin-password':currentAdminPassword }, body: JSON.stringify({specialist_id, date}) });
    loadAdminSchedules();
  } catch (e) { alert('خطأ: ' + e.message); }
}

async function deleteSchedule(id) {
  if (!confirm('حذف الجدول سيؤدي لحذف جميع المواعيد المرتبطة. استمر؟')) return;
  try {
    await apiCall(`/schedules/${id}`, { method: 'DELETE', headers: { 'x-admin-password': currentAdminPassword } });
    loadAdminSchedules();
  } catch (e) { alert('خطأ: ' + e.message); }
}

async function loadAdminReservations() {
  const content = document.getElementById('admin-content');
  try {
    const reservations = await apiCall('/reservations?all=true', { headers: { 'x-admin-password': currentAdminPassword } });
    currentReservations = reservations;
    let html = `<h3 class="text-lg font-bold mb-4">جميع الحجوزات</h3>`;
    if (reservations.length === 0) html += `<p>لا توجد حجوزات.</p>`;
    else {
      html += `<div class="overflow-x-auto"><table class="w-full border"><thead><tr class="bg-gray-100"><th class="p-2 border">المريض</th><th class="p-2 border">NIN</th><th class="p-2 border">تاريخ الميلاد</th><th class="p-2 border">الأخصائي</th><th class="p-2 border">التاريخ</th><th class="p-2 border">الساعة</th><th class="p-2 border">رسالة التوجيه</th><th class="p-2 border">إجراء</th></tr></thead><tbody>`;
      reservations.forEach(r => {
        html += `<tr>
          <td class="p-2 border">${r.patient_first_name} ${r.patient_last_name}</td>
          <td class="p-2 border">${r.patient_nin}</td>
          <td class="p-2 border">${r.patient_dob}</td>
          <td class="p-2 border">${r.specialist_name}</td>
          <td class="p-2 border">${r.date}</td>
          <td class="p-2 border">${r.start_time}</td>
          <td class="p-2 border"><button class="view-letter-btn text-blue-600" data-reservation-id="${r.id}">عرض</button></td>
          <td class="p-2 border"><button onclick="deleteReservation(${r.id})" class="text-red-600">حذف</button></td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }
    content.innerHTML = html;
    attachModalEvents();
  } catch (e) { content.innerHTML = `<p class="text-red-600">خطأ: ${e.message}</p>`; }
}

async function deleteReservation(id) {
  if (!confirm('هل تريد حذف الحجز؟')) return;
  try {
    await apiCall(`/reservations/${id}`, { method: 'DELETE', headers: { 'x-admin-password': currentAdminPassword } });
    loadAdminReservations();
  } catch (e) { alert('خطأ: ' + e.message); }
}

async function loadGenerateToken() {
  const content = document.getElementById('admin-content');
  let html = `<h3 class="text-lg font-bold mb-4">توليد رمز دخول أخصائي</h3>`;
  html += `<select id="token-specialist" class="border p-2 rounded mb-2">`;
  allSpecialists.forEach(s => html += `<option value="${s.id}">${s.name}</option>`);
  html += `</select>`;
  html += `<button onclick="generateToken()" class="bg-cyan-600 text-white px-4 py-2 rounded">توليد</button>`;
  html += `<p id="token-result" class="mt-2 font-mono text-green-700"></p>`;
  content.innerHTML = html;
}

async function generateToken() {
  const specialistId = document.getElementById('token-specialist').value;
  const res = await apiCall('/generate-token', { method: 'POST', headers: { 'Content-Type':'application/json', 'x-admin-password': currentAdminPassword }, body: JSON.stringify({ specialist_id: specialistId }) });
  document.getElementById('token-result').textContent = 'الرمز: ' + res.token;
}

// ====== Specialist Login ======
document.getElementById('specialist-login-btn').addEventListener('click', async () => {
  const token = document.getElementById('specialist-token').value.trim();
  const msg = document.getElementById('specialist-login-msg');
  if (!token) return msg.textContent = 'الرجاء إدخال الرمز';
  try {
    const data = await apiCall(`/specialist-reservations?token=${encodeURIComponent(token)}`);
    if (data.error) throw new Error(data.error);
    specialistToken = token;
    document.getElementById('specialist-token').value = '';
    showSpecialistDashboard();
  } catch (e) {
    msg.textContent = 'الرمز غير صحيح أو منتهي الصلاحية';
  }
});
document.getElementById('specialist-logout').addEventListener('click', () => {
  specialistToken = null;
  currentSpecialistId = null;
  showPublicView();
});

async function loadSpecialistReservations() {
  const container = document.getElementById('specialist-reservations');
  try {
    const data = await apiCall(`/specialist-reservations?token=${encodeURIComponent(specialistToken)}`);
    currentSpecialistId = data.specialistId;
    currentReservations = data.reservations;
    if (data.reservations.length === 0) {
      container.innerHTML = `<p>لا توجد حجوزات لهذا الأخصائي.</p>`;
      return;
    }
    let html = `<div class="overflow-x-auto"><table class="w-full border"><thead><tr class="bg-gray-100"><th class="p-2 border">المريض</th><th class="p-2 border">NIN</th><th class="p-2 border">تاريخ الميلاد</th><th class="p-2 border">التاريخ</th><th class="p-2 border">الساعة</th><th class="p-2 border">رسالة التوجيه</th><th class="p-2 border">إجراء</th></tr></thead><tbody>`;
    data.reservations.forEach(r => {
      html += `<tr>
        <td class="p-2 border">${r.patient_first_name} ${r.patient_last_name}</td>
        <td class="p-2 border">${r.patient_nin}</td>
        <td class="p-2 border">${r.patient_dob}</td>
        <td class="p-2 border">${r.date}</td>
        <td class="p-2 border">${r.start_time}</td>
        <td class="p-2 border"><button class="view-letter-btn text-blue-600" data-reservation-id="${r.id}">عرض</button></td>
        <td class="p-2 border"><button class="follow-up-btn text-green-600" data-reservation-id="${r.id}">حجز متابعة</button></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
    attachModalEvents();
  } catch (e) { container.innerHTML = `<p class="text-red-600">خطأ: ${e.message}</p>`; }
}

// ====== Modal & Follow-up ======
function showModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-overlay').classList.add('hidden'));
document.getElementById('modal-overlay').addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });

function viewLetter(reservationId) {
  const r = currentReservations.find(r => r.id == reservationId);
  if (r && r.letter_base64) showModal(`<img src="${r.letter_base64}" class="max-w-full h-auto rounded" />`);
  else alert('لا توجد رسالة توجيه لهذا الحجز');
}

async function loadSpecialistsIntoSelect(selectId, defaultId) {
  const specs = await apiCall('/specialists');
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">اختر الأخصائي</option>';
  specs.forEach(s => select.innerHTML += `<option value="${s.id}" ${s.id == defaultId ? 'selected' : ''}>${s.name}${s.specialty ? ' - ' + s.specialty : ''}</option>`);
}

async function loadFollowSchedules(sid) {
  const dateS = document.getElementById('follow-date');
  dateS.innerHTML = '<option value="">اختر التاريخ</option>';
  document.getElementById('follow-time').innerHTML = '<option value="">اختر الساعة</option>';
  if (!sid) return;
  const scheds = await apiCall(`/schedules?specialist_id=${sid}`);
  scheds.forEach(s => dateS.innerHTML += `<option value="${s.id}">${s.date}</option>`);
}

async function loadFollowSlots(schId) {
  const timeS = document.getElementById('follow-time');
  timeS.innerHTML = '<option value="">اختر الساعة</option>';
  if (!schId) return;
  const slots = await apiCall(`/slots?schedule_id=${schId}&available=1`);
  slots.forEach(s => timeS.innerHTML += `<option value="${s.id}">${s.start_time}</option>`);
}

function showFollowUpModal(reservation) {
  const patient = {
    nin: reservation.patient_nin,
    firstName: reservation.patient_first_name,
    lastName: reservation.patient_last_name,
    dob: reservation.patient_dob
  };
  const html = `
    <h3 class="text-xl font-bold mb-4 text-cyan-800">حجز موعد متابعة</h3>
    <p class="mb-4"><strong>المريض:</strong> ${patient.firstName} ${patient.lastName} (NIN: ${patient.nin})</p>
    <div class="space-y-4">
      <div>
        <label class="block font-medium mb-1">اختيار الأخصائي</label>
        <select id="follow-specialist" class="w-full border rounded-lg p-3"></select>
      </div>
      <div>
        <label class="block font-medium mb-1">التاريخ</label>
        <select id="follow-date" class="w-full border rounded-lg p-3"><option value="">اختر التاريخ</option></select>
      </div>
      <div>
        <label class="block font-medium mb-1">الساعة</label>
        <select id="follow-time" class="w-full border rounded-lg p-3"><option value="">اختر الساعة</option></select>
      </div>
      <button id="submit-follow-up" class="w-full bg-cyan-600 text-white py-3 rounded-lg font-bold">تأكيد الحجز</button>
      <p id="follow-msg" class="text-center text-sm mt-2"></p>
    </div>
  `;
  showModal(html);
  loadSpecialistsIntoSelect('follow-specialist', currentSpecialistId);
  document.getElementById('follow-specialist').addEventListener('change', function() { loadFollowSchedules(this.value); });
  document.getElementById('follow-date').addEventListener('change', function() { loadFollowSlots(this.value); });
  document.getElementById('submit-follow-up').addEventListener('click', async () => {
    const msg = document.getElementById('follow-msg');
    const slotId = document.getElementById('follow-time').value;
    if (!slotId) return msg.textContent = 'الرجاء اختيار الساعة';
    try {
      await apiCall('/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: slotId,
          nin: patient.nin,
          first_name: patient.firstName,
          last_name: patient.lastName,
          dob: patient.dob,
          letter_base64: null
        })
      });
      msg.textContent = 'تم حجز المتابعة بنجاح';
    } catch (err) {
      let errorMsg = err.message;
      try { errorMsg = JSON.parse(err.message).error || errorMsg; } catch(_) {}
      msg.textContent = 'فشل: ' + errorMsg;
    }
  });
}

function attachModalEvents() {
  document.querySelectorAll('.view-letter-btn').forEach(btn => btn.onclick = function(){ viewLetter(this.dataset.reservationId); });
  document.querySelectorAll('.follow-up-btn').forEach(btn => btn.onclick = function(){
    const r = currentReservations.find(r => r.id == this.dataset.reservationId);
    if (r) showFollowUpModal(r);
  });
}

// Close login modals on overlay click
document.getElementById('admin-login-overlay').addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });
document.getElementById('specialist-login-overlay').addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });

// Start
loadSpecialists();
