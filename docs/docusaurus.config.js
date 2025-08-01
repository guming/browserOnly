const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

// With JSDoc @type annotations, IDEs can provide config autocompletion
/** @type {import('@docusaurus/types').DocusaurusConfig} */
(module.exports = {
  title: 'BrowserOnly Docs',
  tagline: 'Control your browser with natural language',
  url: 'https://parsaghaffari.github.io',
  baseUrl: '/BrowserOnly/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'parsaghaffari', // Usually your GitHub org/user name.
  projectName: 'BrowserOnly', // Usually your repo name.

  presets: [
    [
      '@docusaurus/preset-classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl: 'https://github.com/parsaghaffari/BrowserOnly/edit/main/docs/',
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          editUrl:
            'https://github.com/parsaghaffari/BrowserOnly/edit/main/docs/blog/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'BrowserOnly Docs',
        logo: {
          alt: 'BrowserOnly Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'doc',
            docId: 'intro',
            position: 'left',
            label: 'Documentation',
          },
          {
            type: 'doc',
            docId: 'user-guide',
            position: 'left',
            label: 'User Guide',
          },
          {
            type: 'doc',
            docId: 'privacy-policy',
            position: 'left',
            label: 'Privacy Policy',
          },
          {
            href: 'https://github.com/parsaghaffari/BrowserOnly',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Getting Started',
                to: '/docs/intro',
              },
              {
                label: 'User Guide',
                to: '/docs/user-guide',
              },
              {
                label: 'Architecture',
                to: '/docs/architecture',
              },
              {
                label: 'Privacy Policy',
                to: '/docs/privacy-policy',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'GitHub Discussions',
                href: 'https://github.com/parsaghaffari/BrowserOnly/discussions',
              },
              {
                label: 'GitHub Issues',
                href: 'https://github.com/parsaghaffari/BrowserOnly/issues',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/parsaghaffari/BrowserOnly',
              },
              {
                label: 'Privacy Policy',
                to: '/docs/privacy-policy',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} BrowserOnly Contributors. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
});
