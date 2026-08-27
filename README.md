# LX-AppStore

A modern, responsive, and high-performance Web App Store built with **Flask (Python)** and **Vanilla JS**. It serves as a secure direct high-speed network for downloading APK & XAPK files with authentic version verification, metadata, screenshots, and version histories.

## 🚀 Live Demo
[https://lxappstore.vercel.app/](https://lxappstore.vercel.app/)

---

## 🛠️ Tech Stack & Architecture

### Backend
- **Framework**: Flask (Python 3.12)
- **Deployment Platform**: Vercel Serverless Functions
- **Architecture**: REST API endpoints for home feed, search query parsing, category grouping, and version history.

### Frontend
- **Interface**: Single Page Application (SPA) architecture using dynamic DOM manipulation.
- **Styling**: Modern CSS Custom Properties (CSS variables) for design tokenization (themes, colors, typography, shadows).
- **Icons**: FontAwesome 6 (loaded dynamically via jsDelivr CDN to resolve cross-origin font blocks on mobile).

---

## 💻 Project Structure
```text
LX-AppStore/
├── static/
│   ├── css/
│   │   └── style.css       # Fluid responsive stylesheets & transitions
│   └── js/
│       └── app.js          # SPA engine, search ticker, theme, modal & API handlers
├── templates/
│   └── index.html          # Core single page layout skeleton
├── app.py                  # Local Python server entrypoint
├── requirements.txt        # Backend dependencies
├── vercel.json             # Vercel Serverless configuration (WSGI mapping)
└── README.md               # Developer documentation
```

---

## ✨ Features & Developer Implementation

### 1. Fluid Responsive Design
- Implemented using CSS `clamp()` and viewport units (`vw`) for seamless, pixel-perfect scaling of typography, paddings, and flexbox gaps across screen widths from **325px to 1920px** without abrupt layout jumps.
- Responsive breakpoints (`@media`) reorganize navbar layouts dynamically at `1023px` (collapsing desktop navigation into a slide-out drawer) and `600px` (optimizing list layouts and spacing).

### 2. Search Ticker (Mobile-only Marquee)
- Taps into JavaScript intervals to run a smooth character-shift marquee placeholder animation in the search bar input exclusively on mobile/tablet viewports (`<= 768px`).
- Built to pause the animation dynamically when the input is focused, restoring it on blur if the value remains empty. The search icon remains fixed.

### 3. Custom Wishlist & DOM Modal Confirmations
- App cards inside the Wishlist trigger a CSS-based blur filter overlay containing a small, centered, active blue trash-bin icon.
- Replaced standard browser-native `confirm()` popups (which display ugly `localhost says:` headers) with a custom styled DOM overlay `#confirmModal` configured with a white background, black text, and interactive blue action buttons.

### 4. Theme Engine
- Dual-theme implementation supporting light theme by default and a pure black dark theme (`#000000`).
- Configured using CSS variables and a data-attribute selector (`data-theme="dark"`). Local storage persists the user's choice.

---

## 🚀 Getting Started (Local Development)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hariyanivaidehi/LX-AppStore.git
   cd LX-AppStore
   ```

2. **Set up virtual environment:**
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run development server:**
   ```bash
   python app.py
   ```
   Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.
