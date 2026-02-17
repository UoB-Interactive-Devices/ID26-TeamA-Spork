let port, reader, chart;
let recordedData = [];
let isRecording = false;

// 1. Initialize Chart.js
const ctx = document.getElementById('magChart').getContext('2d');
chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'X', borderColor: '#ff6384', data: [], borderWidth: 2 },
            { label: 'Y', borderColor: '#36a2eb', data: [], borderWidth: 2 },
            { label: 'Z', borderColor: '#cc65fe', data: [], borderWidth: 2 }
        ]
    },
    options: { animation: false, scales: { y: { beginAtZero: false } } }
});

// 2. Serial Connection Logic
async function connect() {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    
    document.getElementById('btnConnect').disabled = true;
    document.getElementById('btnRecord').disabled = false;
    
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();
    readLoop();
}

async function readLoop() {
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let lines = buffer.split("\n");
        buffer = lines.pop();

        for (let line of lines) {
            try {
                const data = JSON.parse(line);
                updateChart(data);
                if (isRecording) recordedData.push({ t: Date.now(), ...data });
            } catch (e) {}
        }
    }
}

function updateChart(data) {
    const maxPoints = 50;
    chart.data.labels.push("");
    chart.data.datasets[0].data.push(data.x);
    chart.data.datasets[1].data.push(data.y);
    chart.data.datasets[2].data.push(data.z);

    if (chart.data.labels.length > maxPoints) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(d => d.data.shift());
    }
    chart.update();
}

// 3. Recording & Export
document.getElementById('btnConnect').addEventListener('click', connect);
document.getElementById('btnRecord').addEventListener('click', (e) => {
    isRecording = !isRecording;
    e.target.innerText = isRecording ? "Stop Recording" : "🔴 Record Data";
    e.target.classList.toggle('recording');
    document.getElementById('btnDownload').disabled = isRecording;
});

document.getElementById('btnDownload').addEventListener('click', () => {
    let csv = "timestamp,x,y,z\n" + recordedData.map(r => `${r.t},${r.x},${r.y},${r.z}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'motion_data.csv';
    a.click();
});