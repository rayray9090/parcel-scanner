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
      // 1) Turn file into base64 string
      const base64 = await fileToBase64(file);

      // 2) Send JSON to backend
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        scanStatus.textContent =
          'Scan failed: ' + (data.error || 'Unknown error from server');
      } else {
        scanStatus.textContent = data.email_sent
          ? 'Package scanned and email notification sent.'
          : 'Package scanned.';

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

// helper to convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // "data:image/jpeg;base64,AAAA..."
      const base64 = result.split(',')[1]; // remove the "data:image..." prefix
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
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
