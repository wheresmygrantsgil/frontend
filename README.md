# University of Haifa Grants Matcher

This project is a small static website that presents matching funding opportunities for researchers at the University of Haifa.  
Researchers can type their name into a search box and view grants that are relevant to them. The matching data is stored in the `grants.json` and `matches.json` files included in this repository.

## Running Locally

Any simple static file server can be used to preview the site. If Python is installed, run:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000/](http://localhost:8000/) in a browser.

## Deployment

No build step is required; the site consists only of HTML, CSS and JavaScript files. It can be hosted on any static hosting service, for example:

- **GitHub Pages** – push the repository to GitHub and enable Pages on the `main` branch.
- **Netlify** – create a site from this repository and set the publish directory to the repository root.

## Colors

The design uses a white background with deep navy (`#213646`) and vivid cyan (`#1DBEE6`) accents.

## Voting & Health Widget

The site integrates with a backend service to record likes and dislikes for each
grant. Users can vote on the grants displayed in their recommendations using the
green **Like** or red **Dislike** buttons. Vote totals update instantly without
reloading the page.

A small banner at the top of the page shows overall voting statistics fetched
from the backend. These stats refresh automatically every minute.
