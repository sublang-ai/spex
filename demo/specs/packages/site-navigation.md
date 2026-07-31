<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# site-navigation: Site Navigation

## Intent

This package gives the product its map: it names what the shell's header presents — navigation entries, session control, and admin entry — and what the home page shows, connecting each to the product's surfaces.
The shell itself stays free of product nouns; the product's navigation choices live here, and nowhere else.

## External Behavior

### site-navigation-1

Where the shell's header carries the deployment's navigation entries, session control, and admin entry [[web-shell-1](site/web-shell.md#web-shell-1)] [[web-shell-2](site/web-shell.md#web-shell-2)], the site shall present them as follows:

- the site name reads "Academy";
- the session control is the account menu [[github-login-5](identity/github-login.md#github-login-5)];
- one navigation entry, labeled "Courses", leads to the course list [[course-catalog-1](catalog/course-catalog.md#course-catalog-1)];
- the admin entry, labeled "Admin", leads to the admin area presenting the course manager [[course-catalog-6](catalog/course-catalog.md#course-catalog-6)] and the video library [[video-library-4](catalog/video-library.md#video-library-4)].

### site-navigation-2

Where the home page's content is the deployment's to choose — no package owns it — the site shall present the course list [[course-catalog-1](catalog/course-catalog.md#course-catalog-1)] as the home page's content for every visitor.

## Verification

### site-navigation-3

Where fixture sessions exist for an admin, a member, and a signed-out visitor on a seeded deployment, the acceptance suite shall assert:

- the home page presents the course list [[site-navigation-2](#site-navigation-2)] [[course-catalog-1](catalog/course-catalog.md#course-catalog-1)];
- the header's site name reads "Academy" [[site-navigation-1](#site-navigation-1)];
- the header's "Courses" entry leads to the course list [[site-navigation-1](#site-navigation-1)] [[web-shell-1](site/web-shell.md#web-shell-1)];
- the session control renders the account menu matching each session state [[site-navigation-1](#site-navigation-1)] [[github-login-5](identity/github-login.md#github-login-5)];
- for the admin session only, the "Admin" entry leads to the admin area with the course manager and the video library both reachable [[site-navigation-1](#site-navigation-1)] [[web-shell-2](site/web-shell.md#web-shell-2)] [[course-catalog-6](catalog/course-catalog.md#course-catalog-6)] [[video-library-4](catalog/video-library.md#video-library-4)].
