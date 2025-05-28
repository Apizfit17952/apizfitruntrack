// Add this after including socket.io in your HTML
let socket;
window.addEventListener('DOMContentLoaded', () => {
  if (typeof io !== "undefined") {
    socket = io();
    // Listen for leaderboard and data updates
    socket.on("leaderboard-update", (newData) => {
      leaderboard = newData;
      if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
    });
    socket.on("alldata-update", (data) => {
      // Apply your logic to update index page data
      // Example: updateDashboard(data);
    });
  }
});
let checkpointData = JSON.parse(localStorage.getItem("checkpointData")) || {};
let checkpoints = JSON.parse(localStorage.getItem("checkpoints")) || ["Start", "Checkpoint 1", "Checkpoint 2", "Finish"];
let leaderboard = [];
const ADMIN_PASSWORD = "admin123";
let isAuthenticated = localStorage.getItem("isAdminAuthenticated") === "true";
const RACE_DISTANCE_KM = 10; // Assumed race distance in kilometers
let flagOffTime = localStorage.getItem("flagOffTime") ? parseInt(localStorage.getItem("flagOffTime")) : null;

// Preload images to improve theme switching performance
function preloadImages() {
  const images = [
    'https://images.unsplash.com/photo-1517649763962-0c623066013b?ixlib=rb-4.0.3&auto=format&fit=cover&w=1920&q=80',
    'https://images.unsplash.com/photo-1508098682722-e99e46c8748d?ixlib=rb-4.0.3&auto=format&fit=cover&w=1920&q=80',
    localStorage.getItem("backdropImage"),
    localStorage.getItem("bannerImage")
  ].filter(url => url); // Only preload valid URLs

  images.forEach(url => {
    const img = new Image();
    img.src = url;
  });
}

// Debounce utility for search inputs and theme toggle
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Format time in milliseconds to HH:MM:SS.mmm
function formatTime(ms) {
  if (!ms && ms !== 0) return "N/A";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

// Format timestamp to local time
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Singapore' });
}

// Format pace in milliseconds to M:SS min/km
function formatPace(ms, distanceKm) {
  if (!ms || !distanceKm || distanceKm === 0) return "N/A";
  const totalMinutes = ms / 1000 / 60 / distanceKm;
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.round((totalMinutes - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, '0')} min/km`;
}

// Get icon for checkpoints
function getCheckpointIcon(checkpoint) {
  if (checkpoint === "Start") return "fa-play";
  if (checkpoint === "Finish") return "fa-flag-checkered";
  const index = checkpoints.indexOf(checkpoint);
  if (index > 0 && index < checkpoints.length - 1) return `fa-${index}`; // Simple number icon
  return "fa-map-marker-alt"; // Default icon
}

// Get icon for runner status
function getStatusIcon(status) {
  switch(status) {
    case "finished": return "fa-check-circle";
    case "in-progress": return "fa-hourglass-half";
    case "dnf": return "fa-times-circle";
    case "dns": return "fa-ban";
    default: return "fa-question-circle";
  }
}

// Show notification popup
function showNotification(message, type = "info") {
  let notificationContainer = document.querySelector(".notification-container");
  if (!notificationContainer) {
    notificationContainer = document.createElement("div");
    notificationContainer.classList.add("notification-container");
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement("div");
  notification.className = `notification ${type} fade-in`;

  let icon = "fa-info-circle";
  if (type === "success") icon = "fa-check-circle";
  if (type === "error") icon = "fa-exclamation-circle";
  if (type === "warning") icon = "fa-exclamation-triangle";

  notification.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
    <button onclick="this.parentElement.classList.add('fade-out'); setTimeout(() => this.parentElement.remove(), 300);">
      <i class="fas fa-times"></i>
    </button>
  `;

  notificationContainer.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.remove("fade-in");
      notification.classList.add("fade-out");
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

// Update leaderboard with search and sorting for all runners
function updateEnhancedLeaderboard() {
  const tableBody = document.getElementById("leaderboard");
  if (!tableBody) return;

  const headers = document.querySelectorAll('#leaderboardTable th');
  if (headers.length >= 4) {
    headers[3].textContent = 'Pace'; // Ensure header is "Pace"
  }

  checkpointData = JSON.parse(localStorage.getItem("checkpointData")) || {};
  const searchQuery = document.getElementById("searchLeaderboard")?.value.trim().toLowerCase() || "";
  tableBody.innerHTML = "";
  leaderboard = []; // Reset leaderboard array for fresh calculation

  const now = new Date().getTime();

  for (let runnerId in checkpointData) {
    const runnerEntry = checkpointData[runnerId];
    const data = runnerEntry.checkpoints || [];
    const name = runnerEntry.name || "Unknown Runner";
    let status = runnerEntry.status || (data.some(e => e.checkpoint === "Finish") ? "finished" : data.length > 0 ? "in-progress" : "dns");
    
    // Ensure status reflects "finished" if "Finish" checkpoint exists, regardless of explicit status
    if (data.some(e => e.checkpoint === "Finish")) {
        status = "finished";
    }

    const completedCheckpoints = data.map(e => e.checkpoint);
    let pace = null; 
    let totalTime = null;
    let distanceKm = 0;
    let lastCheckpointData = data.length > 0 ? data[data.length - 1] : null;
    let lastCheckpoint = lastCheckpointData ? lastCheckpointData.checkpoint : "None";
    let lastTimestamp = lastCheckpointData ? lastCheckpointData.timestamp : null;

    let priority = 0;
    if (status === "finished") priority = 3;
    else if (status === "in-progress") priority = 2;
    else if (status === "dnf") priority = 1;
    else if (status === "dns") priority = 0;

    if (!flagOffTime || status === "dns" || data.length === 0) {
      totalTime = null; 
      pace = null; 
    } else {
      const finishEntry = data.find(e => e.checkpoint === "Finish");
      const startTime = data.find(e => e.checkpoint === "Start")?.timestamp || flagOffTime; // Use actual start if logged, else flagOff
      
      let endTimeForCalc;
      if (finishEntry) {
          endTimeForCalc = finishEntry.timestamp;
          distanceKm = RACE_DISTANCE_KM;
      } else if (lastCheckpointData) { // For in-progress or DNF
          endTimeForCalc = lastCheckpointData.timestamp;
          const lastCpIndex = checkpoints.indexOf(lastCheckpointData.checkpoint);
          if (lastCpIndex !== -1) {
              // Prorate distance based on checkpoints completed. Assumes "Start" is index 0.
              // If "Finish" is the last checkpoint, its index is checkpoints.length - 1.
              // (lastCpIndex + 1) represents number of segments completed if Start is 0th segment.
              // Or, more simply, if checkpoint N of M is done, distance is (N/M-1)*Total for non-finish.
              // Or (N_index / (TotalCPs-1) ) * RACE_DISTANCE_KM if Start=0, Finish=TotalCPs-1
              if (checkpoints.length > 1) {
                distanceKm = (lastCpIndex / (checkpoints.length -1) ) * RACE_DISTANCE_KM;
              } else { // Only Start/Finish defined or just one checkpoint
                distanceKm = 0; // Or some other logic if only one checkpoint
              }
          } else {
              distanceKm = 0; // Unknown checkpoint
          }
      } else { // No checkpoints after start for some reason but not DNS
          endTimeForCalc = now; // Race ongoing, no specific end point yet
          distanceKm = 0; // No progress beyond start
      }
      
      totalTime = endTimeForCalc - startTime;
      pace = (distanceKm > 0 && totalTime > 0) ? totalTime / distanceKm : null;
    }

    if (searchQuery && !runnerId.toLowerCase().includes(searchQuery) && !name.toLowerCase().includes(searchQuery)) continue;

    leaderboard.push({
      runner: runnerId,
      name,
      pace, 
      totalTime, 
      status,
      priority,
      data, // Raw checkpoint entries
      completedCheckpoints, // Names of completed CPs
      lastCheckpoint,
      lastTimestamp,
      startTimestamp: data.find(e => e.checkpoint === "Start")?.timestamp || flagOffTime || Infinity 
    });
  }

  leaderboard.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    
    // For 'finished' and 'in-progress', sort by progress then pace
    if (a.status === "finished" || a.status === "in-progress") {
        if (b.status === "finished" || b.status === "in-progress") {
            // Higher progress (more checkpoints) is better
            if (b.completedCheckpoints.length !== a.completedCheckpoints.length) {
                return b.completedCheckpoints.length - a.completedCheckpoints.length;
            }
            // Then by pace (lower is better)
            if (a.pace === null && b.pace !== null) return 1;  
            if (a.pace !== null && b.pace === null) return -1;
            if (a.pace !== null && b.pace !== null) {
                if (a.pace !== b.pace) return a.pace - b.pace; 
            }
        }
    }
    // If DNF/DNS or paces are equal/null, sort by number of checkpoints completed (more is better)
    if (b.completedCheckpoints.length !== a.completedCheckpoints.length) {
        return b.completedCheckpoints.length - a.completedCheckpoints.length;
    }
    return (a.startTimestamp || Infinity) - (b.startTimestamp || Infinity); // Earlier start time first
  });

  const topRunners = leaderboard.slice(0, 20);

  if (topRunners.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-table">
          <div class="empty-message">
            <i class="fas fa-clipboard-list"></i>
            <p>No runners to display${searchQuery ? ' for "' + searchQuery + '"' : ''}.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  topRunners.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.classList.add("fade-in");

    if (index < 3 && entry.pace && entry.status === "finished") {
      row.classList.add("rank-" + (index + 1)); 
    }

    const statusIcon = getStatusIcon(entry.status);
    let badge = `<span class="badge status-badge ${entry.status}"><i class="fas ${statusIcon}"></i> ${entry.status.toUpperCase()}</span>`;

    const progressCount = entry.completedCheckpoints.length;
    const totalConfiguredCheckpoints = checkpoints.length > 0 ? checkpoints.length : 1; // Avoid division by zero
    const progressPercent = Math.round((progressCount / totalConfiguredCheckpoints) * 100);
    const progressHTML = `<div class="progress-container"><div class="progress-bar" style="width: ${progressPercent}%"></div><span>${progressPercent}% (${progressCount}/${totalConfiguredCheckpoints})</span></div>`;

    let paceFormatted = formatPace(entry.pace, 1); 
    let totalTimeFormatted = formatTime(entry.totalTime); 
    let lastTime = entry.lastTimestamp ? formatTimestamp(entry.lastTimestamp) : "N/A";

    let rankDisplay = `${index + 1}`;
    if (entry.status === "finished" && entry.pace && index < 5) {
      const medalColors = ["gold", "silver", "#cd7f32"]; // Bronze
      const trophyColors = ["silver", "#cd7f32"]; // For 4th, 5th
      if (index < 3) { // Medals for top 3
        rankDisplay = `<i class="fas fa-medal" style="color: ${medalColors[index]}; font-size: 0.9rem; margin-right: 4px;"></i> ${index + 1}`;
      } else if (index < 5) { // Trophies for 4th, 5th
        rankDisplay = `<i class="fas fa-trophy" style="color: ${trophyColors[index-3]}; font-size: 0.9rem; margin-right: 4px;"></i> ${index + 1}`;
      }
    }

    row.innerHTML = `
      <td>${rankDisplay}</td>
      <td>${entry.runner}</td>
      <td>${entry.name}</td>
      <td>${paceFormatted}</td>
      <td>${badge}</td>
      <td>${progressHTML}</td>
      <td>${entry.lastCheckpoint}</td>
      <td>${totalTimeFormatted}</td>
      <td>${lastTime}</td>
    `;
    tableBody.appendChild(row);
  });
}


// Authenticate admin user
function authenticateAdmin() {
  const passwordInput = document.getElementById("admin-password"); 
  if (!passwordInput) return;
  if (passwordInput.value === ADMIN_PASSWORD) {
    isAuthenticated = true;
    localStorage.setItem("isAdminAuthenticated", "true");
    document.getElementById("auth-container").style.display = "none";
    document.getElementById("main-content").style.display = "block";
    initializePage();
    showNotification("Admin access granted", "success");
  } else {
    showNotification("Incorrect password", "error");
    passwordInput.value = "";
  }
}

// Logout admin
function logoutAdmin() {
  isAuthenticated = false;
  localStorage.removeItem("isAdminAuthenticated");
  document.getElementById("main-content").style.display = "none";
  document.getElementById("auth-container").style.display = "block";
  const adminPasswordInput = document.getElementById("admin-password"); 
  if (adminPasswordInput) {
    adminPasswordInput.value = "";
    adminPasswordInput.focus();
  }
  showNotification("Logged out successfully", "info");
}

// Initialize page based on current URL
function initializePage() {
  displayRaceEventName();
  applyImages(); 
  setupRunnerAutocomplete(); 

  const path = window.location.pathname;

  if (path.includes("leaderboard.html")) {
    updateEnhancedLeaderboard();
  } else if (path.includes("settings.html")) {
    displayCheckpointList();
  } else if (path.includes("index.html") || path === "/") { 
    displayCheckpointLog(); 
  }
}


// Apply backdrop and banner images with requestAnimationFrame
function applyImages() {
  requestAnimationFrame(() => {
    try {
      const backdropImage = localStorage.getItem("backdropImage");
      const bannerImage = localStorage.getItem("bannerImage");

      const backdropStyle = backdropImage
        ? `url('${backdropImage}') no-repeat center center/cover`
        : `url('https://images.unsplash.com/photo-1517649763962-0c623066013b?ixlib=rb-4.0.3&auto=format&fit=cover&w=1920&q=80') no-repeat center center/cover`;
      document.body.style.setProperty('--backdrop-image', backdropStyle);

      const bannerStyle = bannerImage
        ? `linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(20, 184, 166, 0.9)), url('${bannerImage}') no-repeat center center/cover`
        : `linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(20, 184, 166, 0.9)), url('https://images.unsplash.com/photo-1508098682722-e99e46c8748d?ixlib=rb-4.0.3&auto=format&fit=cover&w=1920&q=80') no-repeat center center/cover`;
      const banners = document.querySelectorAll('.banner');
      banners.forEach(banner => {
        banner.style.background = bannerStyle;
      });
    } catch (error) {
      console.error("Error applying images:", error);
      showNotification("Failed to apply images", "error");
    }
  });
}

const toggleThemeDebounced = debounce(() => {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  updateThemeToggleIcon();
  applyImages(); 
}, 100);


function updateThemeToggleIcon() {
  const themeToggleIconAuth = document.querySelector("#auth-container .theme-toggle i"); 
  const themeToggleCheckboxAuth = document.getElementById("theme-toggle-checkbox"); 
  const settingsThemeToggleCheckbox = document.querySelector('#appearance-settings .theme-settings input[type="checkbox"]');

  const isDark = document.body.classList.contains("dark");

  if (themeToggleIconAuth) { 
    themeToggleIconAuth.className = isDark ? "fas fa-sun" : "fas fa-moon";
  }
  if (themeToggleCheckboxAuth) { 
     themeToggleCheckboxAuth.checked = isDark;
  }
  if (settingsThemeToggleCheckbox) { 
    settingsThemeToggleCheckbox.checked = isDark;
  }
}

function toggleTheme() { // Global function for settings page checkbox
    toggleThemeDebounced();
}


document.addEventListener('DOMContentLoaded', function() {
  preloadImages();

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark" || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add("dark");
  }
  updateThemeToggleIcon(); 
  // applyImages(); // Called within initializePage or updateThemeToggleIcon indirectly

  const authThemeToggleSwitch = document.querySelector("#auth-container .theme-toggle .switch");
  if (authThemeToggleSwitch) {
    authThemeToggleSwitch.addEventListener('click', toggleThemeDebounced);
  }
  
  const authThemeCheckbox = document.getElementById('theme-toggle-checkbox');
  if (authThemeCheckbox) {
      authThemeCheckbox.addEventListener('change', () => {
        // Debounced function will read from body class, so direct call is fine.
        // Or ensure its internal state is synced if toggleThemeDebounced has side effects from checkbox state.
        // For simplicity, let toggleThemeDebounced handle class and localStorage.
        // The checkbox state is updated by updateThemeToggleIcon.
      });
  }


  const path = window.location.pathname;
  const isLeaderboardPage = path.includes("leaderboard.html");
  const isSettingsPage = path.includes("settings.html");
  const isHomePage = !isLeaderboardPage && !isSettingsPage && (path.includes("index.html") || path === "/");


  const authContainer = document.getElementById("auth-container");
  const mainContent = document.getElementById("main-content");
  const adminPasswordInput = document.getElementById("admin-password"); 

  if (isLeaderboardPage) {
    if (mainContent) mainContent.style.display = "block";
    if (authContainer) authContainer.style.display = "none"; 
    initializePage();
    const searchLeaderboard = document.getElementById("searchLeaderboard");
    if (searchLeaderboard) {
      searchLeaderboard.addEventListener('input', debounce(() => updateEnhancedLeaderboard(), 300));
    }
    const refreshButton = document.querySelector('#leaderboardTable + .card-footer button:first-of-type');
    if (refreshButton) refreshButton.addEventListener('click', updateEnhancedLeaderboard);
    const exportButton = document.querySelector('#leaderboardTable + .card-footer button:last-of-type');
    if (exportButton) exportButton.addEventListener('click', exportToCSV);

    if (isLeaderboardPage) {
    setInterval(updateEnhancedLeaderboard, 10000); // Refresh every 10 seconds
    }

  } else { 
    if (isAuthenticated) {
      if (authContainer) authContainer.style.display = "none";
      if (mainContent) mainContent.style.display = "block";
      initializePage();
    } else {
      if (authContainer) authContainer.style.display = "block";
      if (mainContent) mainContent.style.display = "none";
      if (adminPasswordInput) {
        adminPasswordInput.addEventListener('keypress', function(event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            authenticateAdmin();
          }
        });
        // Also for the login button on auth screen
        const loginButtonAuthScreen = document.querySelector("#auth-container #login-button");
        if(loginButtonAuthScreen) loginButtonAuthScreen.addEventListener('click', authenticateAdmin);
      }
    }
  }

  if (isHomePage && (!mainContent || mainContent.style.display === "block")) {
    const runnerIdInput = document.getElementById("runnerId");
    const logCheckpointButton = document.getElementById("log-checkpoint-button");
    if (logCheckpointButton) logCheckpointButton.addEventListener('click', logCheckpoint);
    if (runnerIdInput) {
      runnerIdInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') { event.preventDefault(); logCheckpoint(); }
      });
    }
    const statusRunnerIdInput = document.getElementById("statusRunnerId");
    const markDnsButton = document.getElementById("mark-dns-button");
    const markDnfButton = document.getElementById("mark-dnf-button");
    if (markDnsButton) markDnsButton.addEventListener('click', markRunnerDNS);
    if (markDnfButton) markDnfButton.addEventListener('click', markRunnerDNF);
    const flagOffButton = document.getElementById("flag-off-button");
    if (flagOffButton) flagOffButton.addEventListener('click', flagOffRace);
  }

  if (isSettingsPage && (!mainContent || mainContent.style.display === "block")) {
    const saveRaceNameButton = document.getElementById("saveRaceName");
    if (saveRaceNameButton) saveRaceNameButton.addEventListener('click', saveRaceEventName);
    const addCheckpointButton = document.getElementById("addCheckpoint");
    if (addCheckpointButton) addCheckpointButton.addEventListener('click', addCheckpoint);
    const saveBackdropButton = document.getElementById("saveBackdrop");
    if (saveBackdropButton) saveBackdropButton.addEventListener('click', saveBackdropImage);
    const clearBackdropButton = document.getElementById("clearBackdrop");
    if (clearBackdropButton) clearBackdropButton.addEventListener('click', clearBackdropImage);
    const saveBannerButton = document.getElementById("saveBanner");
    if (saveBannerButton) saveBannerButton.addEventListener('click', saveBannerImage);
    const clearBannerButton = document.getElementById("clearBanner");
    if (clearBannerButton) clearBannerButton.addEventListener('click', clearBannerImage);
    const importRunnersInput = document.getElementById("importRunners");
    if (importRunnersInput) {
      importRunnersInput.addEventListener('change', (event) => {
        importRunnerData(event.target.files);
        const fileNameSpan = document.getElementById("importFileName");
        if (fileNameSpan && event.target.files.length > 0) {
            fileNameSpan.textContent = event.target.files[0].name;
        } else if (fileNameSpan) {
            fileNameSpan.textContent = "";
        }
      });
    }
    const resetButton = document.getElementById("resetAllData");
    if (resetButton) resetButton.addEventListener('click', resetData);
    if (socket) socket.emit("leaderboard-update", leaderboard);
    if (socket) socket.emit("alldata-update", allData);

    document.querySelectorAll('.settings-card .section-header').forEach(header => {
      header.addEventListener('click', function() {
        const content = this.nextElementSibling;
        const icon = this.querySelector('.toggle-icon');
        const isContentVisible = content.style.display === 'block';
        content.style.display = isContentVisible ? 'none' : 'block';
        icon.classList.toggle('fa-chevron-up', !isContentVisible);
        icon.classList.toggle('fa-chevron-down', isContentVisible);
      });
      // Initialize sections open
       const content = header.nextElementSibling;
       const icon = header.querySelector('.toggle-icon');
       content.style.display = 'block';
       icon.classList.remove('fa-chevron-down');
       icon.classList.add('fa-chevron-up');
    });

    const settingsThemeCheckbox = document.querySelector('#appearance-settings .theme-settings input[type="checkbox"]');
    if (settingsThemeCheckbox) {
        settingsThemeCheckbox.addEventListener('change', toggleThemeDebounced);
    }
  }

  document.querySelectorAll('nav a').forEach(link => {
    if (link.id === "logout-button") { // Special handling for logout
        link.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default link behavior
            logoutAdmin();
        });
    } else {
        link.addEventListener('click', () => {
          setTimeout(() => {
            displayRaceEventName();
            applyImages();
            setupRunnerAutocomplete();
            // Conditional page re-initialization if needed
            const currentPath = window.location.pathname;
            if (currentPath.includes("leaderboard.html")) updateEnhancedLeaderboard();
            else if (currentPath.includes("index.html") || currentPath === "/") displayCheckpointLog();
            else if (currentPath.includes("settings.html")) displayCheckpointList();

          }, 50); 
        });
    }
  });
});


// Log a checkpoint for a runner
function logCheckpoint() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  let runnerId = document.getElementById("runnerId")?.value.trim();
  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }

  if (!checkpointData[runnerId]) {
    showNotification(`Runner ${runnerId} not found. Please import runner data first.`, "error");
    return;
  }

  if (checkpointData[runnerId].status === "dns") {
    showNotification(`Runner ${runnerId} is marked as DNS and cannot log checkpoints`, "error");
    return;
  }

  if (checkpointData[runnerId].status === "dnf") {
    showNotification(`Runner ${runnerId} is marked as DNF and cannot log further checkpoints`, "error");
    return;
  }

  if (checkpointData[runnerId].status === "finished" || checkpointData[runnerId].checkpoints.some(entry => entry.checkpoint === "Finish")) {
    showNotification(`Runner ${runnerId} has already finished the race`, "error");
    return;
  }

  let timestamp = new Date().getTime();
  const existingCheckpoints = checkpointData[runnerId].checkpoints || [];
  let lastLoggedCheckpoint = existingCheckpoints.length > 0
    ? existingCheckpoints[existingCheckpoints.length - 1].checkpoint
    : null;
  
  let nextCheckpointIndex = 0;
  if (lastLoggedCheckpoint) {
      nextCheckpointIndex = checkpoints.indexOf(lastLoggedCheckpoint) + 1;
  } else { // No checkpoints logged yet for this runner
      if (checkpoints[0] === "Start") { // If 'Start' is the first defined checkpoint
        // This assumes 'Start' should be the first logged checkpoint if none exist.
        // It is typically handled by flagOffRace, but this allows manual "Start" if needed.
      } else { // No 'Start' as first CP, or other logic. Start from first defined CP.
        // This branch might need review based on exact race start logic desired for manual logging.
      }
  }
  
  if (nextCheckpointIndex >= checkpoints.length) {
    showNotification(`Runner ${runnerId} has already completed all defined checkpoints.`, "info");
    return; 
  }
  let nextCheckpoint = checkpoints[nextCheckpointIndex];

  checkpointData[runnerId].checkpoints.push({
    checkpoint: nextCheckpoint,
    timestamp
  });
  
  if (nextCheckpoint === "Finish") {
      checkpointData[runnerId].status = "finished";
  } else {
      checkpointData[runnerId].status = "in-progress"; 
  }

  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  showNotification(`Logged ${nextCheckpoint} for Runner ${runnerId}`, "success");
  
  if (document.getElementById("checkpointLog")) displayCheckpointLog(); 
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard(); 

  clearInput();
}

// Start the race for all eligible runners
function flagOffRace() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (Object.keys(checkpointData).length === 0) {
    showNotification("No runners registered. Please import runners first.", "error");
    return;
  }

  if (flagOffTime) {
      if (!confirm("The race has already been flagged off. Are you sure you want to re-flag? This will update the start time for runners who haven't started or finished yet, but could cause inconsistencies if some runners have already recorded times based on the previous flag-off.")) {
          return;
      }
  } else {
      if (!confirm("Are you sure you want to flag off the race? This will set the race start time and log the 'Start' checkpoint for all eligible runners who haven't started yet.")) {
        return;
      }
  }

  const newFlagOffTime = new Date().getTime();
  flagOffTime = newFlagOffTime; // Update global variable
  localStorage.setItem("flagOffTime", flagOffTime.toString());
  let startCount = 0;

  for (let runnerId in checkpointData) {
    const runner = checkpointData[runnerId];
    // Only add/update "Start" if not DNS, not DNF, not finished, and if "Start" is defined as the first checkpoint.
    if (runner.status === "dns" || runner.status === "dnf" || runner.status === "finished" || checkpoints[0] !== "Start") {
      continue;
    }

    const startCheckpointEntry = (runner.checkpoints || []).find(cp => cp.checkpoint === "Start");
    if (!startCheckpointEntry) { // If no "Start" checkpoint exists yet for this runner
      if (!runner.checkpoints) runner.checkpoints = [];
      runner.checkpoints.unshift({ // Add "Start" to the beginning
        checkpoint: "Start",
        timestamp: newFlagOffTime
      });
      runner.status = "in-progress"; 
      startCount++;
    } else {
        // Optionally, if re-flagging, one might update the existing Start time.
        // For now, we only add if not present.
    }
  }

  if (startCount === 0 && !flagOffTime) { // Check newFlagOffTime if it was just set
    showNotification("No eligible runners to start, or 'Start' is not the first defined checkpoint. Runners may have already started, finished, or are marked DNS/DNF.", "warning");
  } else if (startCount > 0) {
    showNotification(`Race flag-off processed! Logged/updated 'Start' checkpoint for ${startCount} runners at ${formatTimestamp(newFlagOffTime)}.`, "success");
  } else {
    showNotification(`Race flag-off time set to ${formatTimestamp(newFlagOffTime)}. No new runners were started (they may have already started or are ineligible).`, "info");
  }

  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  
  if (document.getElementById("checkpointLog")) displayCheckpointLog();
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
}

// Mark runner as Did Not Start
function markRunnerDNS() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const runnerIdInput = document.getElementById("statusRunnerId");
  const runnerId = runnerIdInput?.value.trim();
  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }

  if (!checkpointData[runnerId]) {
    showNotification(`Runner ${runnerId} not found`, "error");
    return;
  }

  // Allow marking as DNS even if 'Start' was logged by flag-off but no other progress.
  // Disallow if other checkpoints are logged or if finished/DNF.
  if ((checkpointData[runnerId].checkpoints || []).length > 1 || 
      ((checkpointData[runnerId].checkpoints || []).length === 1 && checkpointData[runnerId].checkpoints[0].checkpoint !== "Start")) {
    showNotification(`Runner ${runnerId} has recorded progress beyond 'Start' and cannot be marked as DNS. Consider DNF or clearing data.`, "error");
    return;
  }
   if (checkpointData[runnerId].status === "finished" || checkpointData[runnerId].status === "dnf") {
    showNotification(`Runner ${runnerId} is already finished or DNF and cannot be marked as DNS.`, "error");
    return;
  }


  checkpointData[runnerId].status = "dns";
  checkpointData[runnerId].checkpoints = []; // DNS means no race participation, clear any (potential Start) checkpoints.
  checkpointData[runnerId].lastUpdate = new Date().getTime(); 

  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  showNotification(`Runner ${runnerId} marked as DNS`, "success");
  if (runnerIdInput) runnerIdInput.value = "";
  
  if (document.getElementById("checkpointLog")) displayCheckpointLog();
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
}

// Mark runner as Did Not Finish
function markRunnerDNF() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }
  const runnerIdInput = document.getElementById("statusRunnerId");
  const runnerId = runnerIdInput?.value.trim();
  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }

  if (!checkpointData[runnerId]) {
    showNotification(`Runner ${runnerId} not found`, "error");
    return;
  }

  // Prevent marking finished runner as DNF (already in place)
  if (checkpointData[runnerId].status === "finished") { 
    showNotification(`Runner ${runnerId} has already finished and cannot be marked as DNF`, "error");
    return;
  }

  if (checkpointData[runnerId].status === "dns") {
    showNotification(`Runner ${runnerId} is marked as DNS (Did Not Start) and cannot be marked as DNF.`, "error");
    return;
  }
  
  // DNF implies they started. If no 'Start' checkpoint yet, and race has flagged off, add 'Start'.
  const runnerCheckpoints = checkpointData[runnerId].checkpoints || [];
  if (!runnerCheckpoints.some(cp => cp.checkpoint === "Start") && flagOffTime && checkpoints.includes("Start")) {
     runnerCheckpoints.unshift({ checkpoint: "Start", timestamp: flagOffTime });
     checkpointData[runnerId].checkpoints = runnerCheckpoints;
  } else if (runnerCheckpoints.length === 0) { // No checkpoints at all
      showNotification(`Runner ${runnerId} has no recorded activity. Mark as DNS or log 'Start' checkpoint first if they participated.`, "warning");
      return; // Or automatically log 'Start' if flagOffTime exists. For now, more explicit.
  }

  checkpointData[runnerId].status = "dnf";
  checkpointData[runnerId].lastUpdate = new Date().getTime(); 

  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  showNotification(`Runner ${runnerId} marked as DNF`, "success");
  if(runnerIdInput) runnerIdInput.value = "";
  
  if (document.getElementById("checkpointLog")) displayCheckpointLog();
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
}

// Clear runner ID input
function clearInput() {
  const runnerIdInput = document.getElementById("runnerId");
  if (runnerIdInput) {
    runnerIdInput.value = "";
    runnerIdInput.focus();
  }
}

function displayCheckpointLog() {
  const logList = document.getElementById("checkpointLog");
  if (!logList) return; 

  logList.innerHTML = "";
  let foundEntries = false;
  const activities = [];

  for (let runnerId in checkpointData) {
    const runnerInfo = checkpointData[runnerId];
    const runnerName = runnerInfo.name || "Unknown Name";

    if (runnerInfo.status === "dns" || runnerInfo.status === "dnf") {
      if(runnerInfo.lastUpdate) { // Only show status entries if they have a lastUpdate timestamp
        const statusTime = ` (${formatTimestamp(runnerInfo.lastUpdate)})`;
        const statusText = runnerInfo.status === "dns" ? "Did Not Start" : "Did Not Finish";
        const statusIcon = getStatusIcon(runnerInfo.status);
        activities.push({
          timestamp: runnerInfo.lastUpdate,
          html: `
            <div class="log-item-icon status-icon ${runnerInfo.status}">
              <i class="fas ${statusIcon}"></i>
            </div>
            <div class="log-item-content">
              <div class="log-item-title">Runner ${runnerId} (${runnerName}) <span class="badge status-badge ${runnerInfo.status}"><i class="fas ${statusIcon}"></i> ${runnerInfo.status.toUpperCase()}</span></div>
              <div class="log-item-time">${statusText}${statusTime}</div>
            </div>
          `
        });
        foundEntries = true;
      }
    }

    (runnerInfo.checkpoints || []).forEach((entry) => {
      foundEntries = true;
      const icon = getCheckpointIcon(entry.checkpoint);
      const timeFormatted = formatTimestamp(entry.timestamp);
      activities.push({
        timestamp: entry.timestamp,
        html: `
          <div class="log-item-icon">
            <i class="fas ${icon}"></i>
          </div>
          <div class="log-item-content">
            <div class="log-item-title">Runner ${runnerId} (${runnerName}) reached ${entry.checkpoint}</div>
            <div class="log-item-time">${timeFormatted}</div>
          </div>
        `
      });
    });
  }

  activities.sort((a, b) => b.timestamp - a.timestamp); 

  if (!foundEntries) {
    logList.innerHTML = `
      <li class="log-item">
        <div class="log-item-icon"><i class="fas fa-info-circle"></i></div>
        <div class="log-item-content">
          <div class="log-item-title">No activity yet.</div>
          <div class="log-item-time">Use "Runner Check-in" or "Race Control" to log activities.</div>
        </div>
      </li>`;
  } else {
    activities.forEach(activity => {
      let listItem = document.createElement("li");
      listItem.classList.add("fade-in", "log-item");
      listItem.innerHTML = activity.html;
      logList.appendChild(listItem);
    });
  }
}


function resetData() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (confirm("Are you sure you want to reset ALL data? This includes runner data, checkpoints, race progress, event name, and appearance settings. This cannot be undone.")) {
    localStorage.removeItem("checkpointData");
    localStorage.removeItem("importedRunnerIDs"); 
    localStorage.removeItem("raceEventName");
    localStorage.removeItem("flagOffTime");
    localStorage.removeItem("backdropImage");
    localStorage.removeItem("bannerImage");
    localStorage.removeItem("checkpoints"); 

    checkpointData = {};
    flagOffTime = null;
    leaderboard = []; // Clear current leaderboard array
    checkpoints = ["Start", "Checkpoint 1", "Checkpoint 2", "Finish"]; // Reset to default
    localStorage.setItem("checkpoints", JSON.stringify(checkpoints)); 

    showNotification("All data has been reset", "info");
    
    if (document.getElementById("checkpointLog")) displayCheckpointLog();
    if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
    
    displayRaceEventName(); 
    applyImages(); 
    setupRunnerAutocomplete(); 
    
    if (window.location.pathname.includes("settings.html")) {
        displayCheckpointList(); 
        const raceEventNameInput = document.getElementById("raceEventName");
        if(raceEventNameInput) raceEventNameInput.value = ""; 
        const importFileNameSpan = document.getElementById("importFileName");
        if(importFileNameSpan) importFileNameSpan.textContent = ""; 
    }
  }
}

function exportToCSV() {
  const currentLeaderboardData = leaderboard; // Use the global leaderboard array populated by updateEnhancedLeaderboard

  if (currentLeaderboardData.length === 0) { 
    showNotification("No data in the current leaderboard view to export. Refresh or clear search.", "warning");
    return;
  }

  let csvContent = "Rank,Runner ID,Runner Name,Pace (min/km),Status,Progress (%),Last Checkpoint,Total Time,Last Update Timestamp\n";

  currentLeaderboardData.forEach((entry, index) => { 
    const rank = index + 1; // Rank is based on the current view (e.g., top 20)
    const runnerId = (entry.runner || "").toString().replace(/"/g, '""');
    const name = (entry.name || "").toString().replace(/"/g, '""');
    const paceFormatted = formatPace(entry.pace, 1);
    const status = (entry.status || "").toUpperCase();
    
    const progressCount = (entry.completedCheckpoints || []).length;
    const totalConfiguredCheckpoints = checkpoints.length > 0 ? checkpoints.length : 1;
    const progressPercent = Math.round((progressCount / totalConfiguredCheckpoints) * 100);

    const lastCheckpoint = (entry.lastCheckpoint || "").toString().replace(/"/g, '""');
    const totalTimeFormatted = formatTime(entry.totalTime);
    const lastUpdateFormatted = entry.lastTimestamp ? new Date(entry.lastTimestamp).toISOString() : "N/A";

    csvContent += `${rank},"${runnerId}","${name}","${paceFormatted}","${status}",${progressPercent},"${lastCheckpoint}","${totalTimeFormatted}","${lastUpdateFormatted}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const raceNameForFile = (localStorage.getItem("raceEventName") || "RaceData").replace(/\s+/g, '_');
  link.setAttribute("download", `${raceNameForFile}_Leaderboard_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showNotification("Leaderboard data exported successfully!", "success");
}

function importRunnerData(files) {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const path = window.location.pathname;
  if (!path.includes("settings.html")) {
    showNotification("This function is only available on the settings page.", "error");
    return;
  }

  if (!files || files.length === 0) {
    showNotification("No file selected", "error");
    const importFileNameSpan = document.getElementById("importFileName");
    if(importFileNameSpan) importFileNameSpan.textContent = ""; // Clear file name display
    return;
  }

  const file = files[0];
  const reader = new FileReader();

  reader.onload = function(e) {
    const contents = e.target.result;
    if (file.name.endsWith('.csv')) {
      processCSVImport(contents);
    } else {
      showNotification("Please upload a CSV file (e.g., .csv)", "error");
       const importFileNameSpan = document.getElementById("importFileName");
       if(importFileNameSpan) importFileNameSpan.textContent = "Invalid file type";
    }
  };
  reader.onerror = function() {
    showNotification("Error reading file", "error");
  };
  reader.readAsText(file);
}

function processCSVImport(csvData) {
  if (!isAuthenticated) return;

  const lines = csvData.split(/\r\n|\n/); 
  if (lines.length <= 1 && lines[0].trim() === "") {
    showNotification("CSV file is empty or has no data rows", "error");
    return;
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const runnerIdIndex = headers.findIndex(h => h === 'runner id' || h === 'id');
  const nameIndex = headers.findIndex(h => h === 'name' || h === 'runner name');

  if (runnerIdIndex === -1) {
    showNotification("CSV must contain a 'Runner ID' (or 'ID') column.", "error");
    return;
  }
   if (nameIndex === -1) {
    showNotification("CSV must contain a 'Name' (or 'Runner Name') column.", "error"); 
    return;
  }

  let newRunners = 0;
  let updatedRunners = 0;
  let processedCount = 0;
  let existingRunnerIDs = new Set(Object.keys(checkpointData));
  let allImportedRunnerIDs = new Set(JSON.parse(localStorage.getItem("importedRunnerIDs") || "[]"));


  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length <= Math.max(runnerIdIndex, nameIndex)) {
        console.warn(`Skipping malformed CSV line ${i+1}: ${lines[i]}`);
        continue; 
    }

    const runnerId = values[runnerIdIndex].trim();
    const name = values[nameIndex] ? values[nameIndex].trim() : "Unnamed Runner";

    if (!runnerId || !name) { 
        console.warn(`Skipping line ${i+1}: Missing Runner ID or Name. ID: '${runnerId}', Name: '${name}'`);
        continue;
    }

    if (!existingRunnerIDs.has(runnerId)) {
      checkpointData[runnerId] = {
        name: name,
        checkpoints: [],
        status: null 
      };
      newRunners++;
      existingRunnerIDs.add(runnerId); // Add to current session's known IDs
    } else {
      checkpointData[runnerId].name = name; // Update name if ID exists
      updatedRunners++;
    }
    allImportedRunnerIDs.add(runnerId); // Keep track of all IDs ever imported for autocomplete
    processedCount++;
  }

  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  localStorage.setItem("importedRunnerIDs", JSON.stringify(Array.from(allImportedRunnerIDs)));
  showNotification(`Successfully processed ${processedCount} runners (${newRunners} new, ${updatedRunners} updated).`, "success");
  
  setupRunnerAutocomplete(); 
  if (document.getElementById("checkpointLog")) displayCheckpointLog(); 
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard(); 
}

function parseCSVLine(line) {
  const result = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && i + 1 < line.length && line[i+1] === '"') { // Escaped quote
        if (inQuotes) currentField += '"'; // Add single quote if inside a quoted field
        i++; 
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField); 
  return result.map(field => field.trim()); // Trim each field
}


function setupRunnerAutocomplete() {
  const inputs = [
    document.getElementById("runnerId"),      
    document.getElementById("statusRunnerId") 
  ].filter(input => input); 

  const importedRunnerIDs = JSON.parse(localStorage.getItem("importedRunnerIDs") || "[]");
  
  let datalist = document.getElementById("runnerIdList");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "runnerIdList";
    document.body.appendChild(datalist); 
  }

  datalist.innerHTML = ""; 

  if (importedRunnerIDs.length > 0) {
    importedRunnerIDs.forEach(id => {
      const option = document.createElement("option");
      option.value = id;
      if (checkpointData[id] && checkpointData[id].name) {
         option.textContent = checkpointData[id].name; // Show name in datalist if available
      }
      datalist.appendChild(option);
    });
  }

  inputs.forEach(input => {
    if (importedRunnerIDs.length > 0) {
      input.setAttribute("list", "runnerIdList");
    } else {
      input.removeAttribute("list"); 
    }
  });
}


function saveRaceEventName() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const raceEventNameInput = document.getElementById("raceEventName");
  if (!raceEventNameInput) return;
  const raceEventName = raceEventNameInput.value.trim();

  if (!raceEventName) {
    showNotification("Please enter a race event name", "error");
    return;
  }

  localStorage.setItem("raceEventName", raceEventName);
  showNotification(`Race event name "${raceEventName}" saved`, "success");
  displayRaceEventName(); 
}

function displayRaceEventName() {
  const raceEventName = localStorage.getItem("raceEventName") || "Race Event Not Set";
  const elementsToUpdate = [
    document.getElementById("bannerRaceEventName"),
    document.getElementById("leaderboardRaceEventName"), 
    document.getElementById("leaderboardBannerRaceEventName"), 
    document.getElementById("settingsRaceEventName"), 
    // For settings page input field as well, if desired
    // document.getElementById("raceEventName") // Input field on settings
  ].filter(el => el); 

  elementsToUpdate.forEach(element => {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        // For input fields, set their value
        if (element.id === "raceEventName" && window.location.pathname.includes("settings.html")){
             element.value = raceEventName === "Race Event Not Set" ? "" : raceEventName;
        } else {
            element.textContent = raceEventName; // Should not happen for inputs with this list
        }
    } else {
        // For other elements, set textContent
        element.textContent = raceEventName;
    }
    element.title = raceEventName; 
  });
  // If on settings page, also update the input field placeholder/value
  if(window.location.pathname.includes("settings.html")){
    const raceNameInput = document.getElementById("raceEventName");
    if(raceNameInput && (raceEventName !== "Race Event Not Set")) {
        raceNameInput.value = raceEventName;
    }
  }
}

function addCheckpoint() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const checkpointNameInput = document.getElementById("checkpointName");
  if (!checkpointNameInput) return;
  const checkpointName = checkpointNameInput.value.trim();

  if (!checkpointName) {
    showNotification("Please enter a checkpoint name", "error");
    return;
  }
  if (checkpointName.toLowerCase() === "start" || checkpointName.toLowerCase() === "finish"){
    showNotification("'Start' and 'Finish' are reserved names and cannot be added manually as custom checkpoints.", "error");
    return;
  }

  if (checkpoints.map(c => c.toLowerCase()).includes(checkpointName.toLowerCase())) {
    showNotification("Checkpoint name already exists (case-insensitive)", "error");
    return;
  }

  const finishIndex = checkpoints.indexOf("Finish");
  if (finishIndex !== -1) {
    checkpoints.splice(finishIndex, 0, checkpointName); 
  } else { // Should not happen if "Finish" is always there
    checkpoints.push(checkpointName);
    checkpoints.push("Finish"); // Ensure "Finish" is last
  }
  
  // Ensure "Start" is first if it got displaced or wasn't there (defensive)
  if (checkpoints[0] !== "Start") {
    checkpoints = checkpoints.filter(cp => cp.toLowerCase() !== "start"); // Remove any other "start"
    checkpoints.unshift("Start");
  }
  // Ensure "Finish" is last
  if (checkpoints[checkpoints.length - 1] !== "Finish") {
    checkpoints = checkpoints.filter(cp => cp.toLowerCase() !== "finish");
    checkpoints.push("Finish");
  }


  localStorage.setItem("checkpoints", JSON.stringify(checkpoints));
  checkpointNameInput.value = "";
  displayCheckpointList();
  showNotification(`Checkpoint "${checkpointName}" added`, "success");
}

function deleteCheckpoint(checkpointToDelete) {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (checkpointToDelete.toLowerCase() === "start" || checkpointToDelete.toLowerCase() === "finish") {
    showNotification("Cannot delete the immutable 'Start' or 'Finish' checkpoints.", "error");
    return;
  }

  if (!confirm(`Are you sure you want to delete the "${checkpointToDelete}" checkpoint? This will remove it from the configuration and from all runner logs where it appears.`)) {
    return;
  }

  checkpoints = checkpoints.filter(c => c.toLowerCase() !== checkpointToDelete.toLowerCase());

  for (let runnerId in checkpointData) {
    if (checkpointData[runnerId].checkpoints) {
        checkpointData[runnerId].checkpoints = checkpointData[runnerId].checkpoints.filter(
          entry => entry.checkpoint.toLowerCase() !== checkpointToDelete.toLowerCase()
        );
    }
  }

  localStorage.setItem("checkpoints", JSON.stringify(checkpoints));
  localStorage.setItem("checkpointData", JSON.stringify(checkpointData)); 

  displayCheckpointList(); 
  showNotification(`Checkpoint "${checkpointToDelete}" deleted`, "success");
  
  if (window.location.pathname.includes("leaderboard.html")) updateEnhancedLeaderboard();
  if (document.getElementById("checkpointLog")) displayCheckpointLog();
}

function displayCheckpointList() {
  if (!window.location.pathname.includes("settings.html") || !isAuthenticated) return;

  const checkpointListUl = document.getElementById("checkpointList");
  if (!checkpointListUl) return;

  checkpointListUl.innerHTML = ""; 

  if (!checkpoints || checkpoints.length === 0) { // Should always have Start/Finish
    checkpoints = ["Start", "Finish"]; // Reset to minimal defaults if empty
    localStorage.setItem("checkpoints", JSON.stringify(checkpoints));
  }

  checkpoints.forEach(checkpoint => {
    const li = document.createElement("li");
    li.classList.add("fade-in", "log-item");

    const icon = getCheckpointIcon(checkpoint);
    const isImmutable = checkpoint.toLowerCase() === "start" || checkpoint.toLowerCase() === "finish";

    li.innerHTML = `
      <div class="log-item-icon">
        <i class="fas ${icon}"></i>
      </div>
      <div class="log-item-content">
        <div class="log-item-title">${checkpoint}</div>
      </div>
      ${isImmutable ? '<span class="immutable-label">Immutable</span>' : `
        <button class="btn btn-danger btn-sm" onclick="deleteCheckpoint('${checkpoint.replace(/'/g, "\\'")}')" title="Delete ${checkpoint}">
          <i class="fas fa-trash"></i> Delete
        </button>
      `}
    `;
    checkpointListUl.appendChild(li);
  });
}

function saveBackdropImage() {
  if (!isAuthenticated) { showNotification("Admin access required", "error"); return; }
  const backdropInput = document.getElementById("backdropImage");
  if (!backdropInput || !backdropInput.files || backdropInput.files.length === 0) {
    showNotification("Please select a backdrop image file.", "error"); return;
  }
  const file = backdropInput.files[0];
  if (!file.type.startsWith('image/')) {
    showNotification("Please upload an image file (e.g., JPG, PNG, GIF).", "error"); return;
  }
  if (file.size > 5 * 1024 * 1024) { 
    showNotification("Image size exceeds 5MB limit.", "error"); return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      localStorage.setItem("backdropImage", e.target.result);
      applyImages(); 
      showNotification("Backdrop image saved.", "success");
      backdropInput.value = ""; 
      preloadImages(); 
    } catch (error) {
      showNotification(error.name === 'QuotaExceededError' ? "Storage limit exceeded." : "Failed to save image.", "error");
      console.error("Backdrop save error:", error);
    }
  };
  reader.onerror = function() { showNotification("Error reading backdrop image.", "error"); };
  reader.readAsDataURL(file);
}

function saveBannerImage() {
  if (!isAuthenticated) { showNotification("Admin access required", "error"); return; }
  const bannerInput = document.getElementById("bannerImage");
   if (!bannerInput || !bannerInput.files || bannerInput.files.length === 0) {
    showNotification("Please select a banner image file.", "error"); return;
  }
  const file = bannerInput.files[0];
  if (!file.type.startsWith('image/')) {
    showNotification("Please upload an image file.", "error"); return;
  }
  if (file.size > 5 * 1024 * 1024) { 
    showNotification("Image size exceeds 5MB limit.", "error"); return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      localStorage.setItem("bannerImage", e.target.result);
      applyImages();
      showNotification("Banner image saved.", "success");
      bannerInput.value = ""; 
      preloadImages();
    } catch (error) {
      showNotification(error.name === 'QuotaExceededError' ? "Storage limit exceeded." : "Failed to save image.", "error");
      console.error("Banner save error:", error);
    }
  };
   reader.onerror = function() { showNotification("Error reading banner image.", "error");};
  reader.readAsDataURL(file);
}

function clearBackdropImage() {
  if (!isAuthenticated) { showNotification("Admin access required", "error"); return; }
  localStorage.removeItem("backdropImage");
  applyImages(); 
  showNotification("Backdrop image cleared.", "success");
  const backdropInput = document.getElementById("backdropImage");
  if (backdropInput) backdropInput.value = ""; 
  preloadImages();
}

function clearBannerImage() {
  if (!isAuthenticated) { showNotification("Admin access required", "error"); return; }
  localStorage.removeItem("bannerImage");
  applyImages(); 
  showNotification("Banner image cleared.", "success");
  const bannerInput = document.getElementById("bannerImage");
  if(bannerInput) bannerInput.value = ""; 
  preloadImages();
}
