# First-Person 3D (Green Ground)

Single-file HTML demo using Three.js with mouse look and WASD movement on a flat green ground.

## How to run
- Double-click `index.html` to open in your browser (requires internet to load Three.js CDN), or from PowerShell:

```powershell
Start-Process .\index.html
```

## Create a new Git repository
You can turn this folder into a new Git repository and push it to your Git hosting service.

1. Initialize and commit:
	- In PowerShell, run from this folder:
	  ```powershell
	  git init
	  git add .
	  git commit -m "Initial commit: three.js first-person terrain demo"
	  ```
2. Create a new empty repo on your Git host (e.g., GitHub, GitLab, Bitbucket) and copy its remote URL (HTTPS or SSH).
3. Add the remote and push (replace with your URL):
	```powershell
	git remote add origin https://github.com/<your-user>/<your-repo>.git
	git branch -M main
	git push -u origin main
	```
4. Optional: add a license file (MIT) and enable GitHub Pages to serve `index.html`.

## Controls
- Click "Start" to enable mouse look (Pointer Lock).
- Move: W A S D
- Look: Mouse
- Unlock cursor: Esc

## Notes
- If Three.js fails to load (offline), you’ll see a message. I can also bundle it locally on request.
 
## Repo structure
 - `index.html` — all code (rendering, input, terrain, trees, HUD)
 - `README.md` — this file
 - `LICENSE` — add your chosen license (optional)
