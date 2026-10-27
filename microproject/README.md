# BusTrack — Bus Arrival & Departure Micro-Project

A responsive frontend-only timetable project with an Admin page. Admin can add, edit, delete, export, and import bus details. The public `index.html` timetable reflects saved changes in the same browser.

## Files
- `index.html`: public timetable
- `admin.html`: bus management page
- `app.js`, `admin.js`: browser-side logic
- `styles.css`: responsive design
- `data/buses.json`: starter data
- `Dockerfile`: Nginx container
- `k8s/`: Kubernetes deployment and service manifests

## Run locally with Docker
From this folder:
```bash
docker build -t bustrack:1.0 .
docker run --rm -p 8080:80 bustrack:1.0
```
Open http://localhost:8080 and click Admin.

## Kubernetes
For a local Kubernetes cluster where the image is available:
```bash
docker build -t bustrack:1.0 .
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl get deployments,pods,services
```
Open `http://localhost:30080` when using a local cluster that exposes NodePort (e.g. Docker Desktop Kubernetes). If using a remote cluster, image registry and networking configuration may be required.

## Deploy on Render
1. Push the project files to a GitHub repository.
2. In Render, create a **Static Site** connected to that repository.
3. Leave Build Command blank.
4. Set Publish Directory to `.`.
5. Deploy. Your `index.html` will be the public page; `admin.html` opens the admin page.

## Important limitation
This version has no backend or shared database. It loads `data/buses.json` for initial sample records, then stores edits in `localStorage` in the current browser. Therefore, changes made in Admin appear on Index in that same browser only; they do not update the hosted JSON file or other visitors' browsers. Import/Export JSON can be used to manually move data between browsers. For admin edits to become visible to all visitors, you need an API/backend and a shared database (or a storage service with controlled write access). Do not expose database credentials in frontend JavaScript.
