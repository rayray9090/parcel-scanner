// ===== Supabase Auth Setup =====

// Your real Supabase values
const SUPABASE_URL = 'https://jmphpdcacxqznthczhlz.supabase.co';
const SUPABASE_ANON_KEY =
  'sb_publishable_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptcGhwZGNhY3hxem50aGN6aGx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNzg3MjIsImV4cCI6MjA3ODk1NDcyMn0.YsgnUFi2mGVs8acRWZO5G8JYVTdf0GjBaNf31MvlCDE';

if (!window.supabase) {
  console.error('Supabase JS library not loaded');
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const loginScreen = document.getElementById('login-screen');
const app = document.getElementById('app');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const loginMessage = document.getElementById('loginMessage');

// Allow any Google account for now
const ALLOWED_DOMAIN = '';

function showLogin() {
  if (!loginScreen || !app) return;
  loginScreen.classList.remove('hidden');
  app.classList.add('hidden');
}

function showApp() {
  if (!loginScreen || !app) return;
  loginScreen.classList.add('hidden');
  app.classList.remove('hidden');
}

async function checkAuth() {
  const { data, error } = await supabaseClient.auth.getUser();

  // If there's an error OTHER than "Auth session missing!", show it
  if (error && error.message !== 'Auth session missing!') {
    console.log('Auth error:', error);
    if (loginMessage) {
      loginMessage.textContent = 'Auth error: ' + error.message;
    }
    showLogin();
    return;
  }

  // If there's no user yet, just show the login screen with no error text
  if (!data || !data.user) {
    if (loginMessage) {
      loginMessage.textContent = '';
    }
    showLogin();
    return;
  }

  const email = data.user.email || '';

  if (ALLOWED_DOMAIN && !email.endsWith(ALLOWED_DOMAIN)) {
    if (loginMessage) {
      loginMessage.textContent = 'This email is not allowed for this app.';
    }
    await supabaseClient.auth.signOut();
    showLogin();
    return;
  }

  // Logged in and allowed
  showApp();
}

// Handle click on "Sign in with Google"
if (googleLoginBtn) {
  googleLoginBtn.addEventListener('click', async () => {
    if (loginMessage) {
      loginMessage.textContent = 'Redirecting to Google...';
    }

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error && loginMessage) {
      loginMessage.textContent = 'Login error: ' + error.message;
    }
  });
}

// When Supabase auth state changes (e.g. after redirect)
supabaseClient.auth.onAuthStateChange((_event, _session) => {
  checkAuth();
});

// Initial check on page load
checkAuth();

// ===== End Supabase Auth Setup =====

// ===== Existing dashboard logic =====

const labelInput = document.getElementById('labelInput');
const chooseFileButton = document.getElementById('chooseFileButton');
const fileNameSpan = document.getElementById('fileName');
const scanButton = document.getElementById('scanButton');
const scanStatus = document.getElementById('scanStatus');
const packageTableBody = document.getElementById('packageTableBody');
const lastScanName = document.getElementById('lastScanName');
const lastScanTime = document.getElementById('lastScanTime');
const todayCount = document.getElementById('todayCount');

let packages = [];

if (chooseFileButton && labelInput) {
  chooseFileButton.addEventListener('click', () => {
    labelInput.click();
  });

  labelInput.addEventListener('change', () => {
    const file = labelInput.files[0];
    fileNameSpan.textContent = file ? file.name : 'No file chosen';
  });
}

if (scanButton) {
  scanButton.addEventListener('click', async () => {
    const file = labelInput.files[0];

    if (!file) {
      alert('Please choose a label photo first.');
      return;
    }

    scanButton.disabled = true;
    scanButton.textContent = 'Scanning...';
    scanStatus.textContent = 'Contacting server...';

    try {
      const formData = new FormData();
      formData.append('label', file);

      const response = await fetch('/api/scan', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        scanStatus.textContent =
          'Scan failed: ' + (data.error || 'Unknown error from server');
      } else {
        scanStatus.textContent = data.email_sent
          ? 'Package scanned and email notification sent.'
          : 'Package scanned (no email found for this recipient).';

        if (data.package) {
          packages.unshift(data.package);
          renderTable();
          updateMetrics(data.package);
        }
      }
    } catch (err) {
      console.error(err);
      scanStatus.textContent = 'Network error while scanning.';
    } finally {
      scanButton.disabled = false;
      scanButton.textContent = 'Scan & Log Package';
    }
  });
}

function renderTable() {
  if (!packageTableBody) return;

  packageTableBody.innerHTML = '';

  packages.forEach((pkg) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${pkg.recipient_name || '-'}</td>
      <td>${pkg.recipient_email || '-'}</td>
      <td>${pkg.carrier || '-'}</td>
      <td>${pkg.tracking_number || '-'}</td>
      <td>${formatDateTime(pkg.time_received)}</td>
      <td><span class="status-pill">${pkg.status || 'Waiting'}</span></td>
    `;

    packageTableBody.appendChild(tr);
  });
}

function updateMetrics(pkg) {
  if (lastScanName) {
    lastScanName.textContent = pkg.recipient_name || 'Unknown';
  }
  if (lastScanTime) {
    lastScanTime.textContent = formatDateTime(pkg.time_received);
  }
  if (todayCount) {
    todayCount.textContent = packages.length.toString();
  }
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

