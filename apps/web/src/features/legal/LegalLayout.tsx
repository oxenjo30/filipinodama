import { useNavigate } from "react-router-dom";

/**
 * LegalLayout — shared shell for the five legal documents (Privacy, Terms,
 * Community, Fair Play / Anti-Cheat, and Data & Account). A sticky tab sidebar +
 * a document column; the tabs are real router navigation between the /privacy,
 * /terms, /community, /anti-cheat, /data routes and the `active` prop (set by
 * each route's page component) selects the document and highlighted tab.
 *
 * Policy copy is the compiled legal text supplied in legal/ (the four .docx
 * documents), transcribed faithfully. The Data & Account tab keeps the app-store
 * required account-deletion / data-export instructions. A `§` prefix on a
 * paragraph marks a bold sub-clause heading; a `•` prefix marks a bullet item.
 */

type LegalDoc = {
  kicker: string;
  title: string;
  updated: string;
  intro: string;
  sections: { no: string; heading: string; paras: string[] }[];
};

export type LegalKey = "privacy" | "terms" | "community" | "anticheat" | "data";

const UPDATED = "July 8, 2026";

const LEGAL_DATA: Record<LegalKey, LegalDoc> = {
  privacy: {
    kicker: 'Privacy',
    title: 'Privacy Policy',
    updated: UPDATED,
    intro:
      'This Privacy Policy explains how FilipinoDama ("we", "our", or "us") collects, uses, stores, protects, and discloses information when you access or use FilipinoDama, including the browser-based game, ranked matchmaking, AI matches, guild system, leaderboards, virtual store, support services, and related features. Your privacy is important to us. We are committed to processing personal information responsibly and in accordance with applicable laws, including the Philippine Data Privacy Act of 2012 where applicable. By creating an account or using the Service, you acknowledge that you have read this Privacy Policy.',
    sections: [
      {
        no: '2',
        heading: 'Scope',
        paras: [
          'This Privacy Policy applies to information collected through FilipinoDama.com and any future official FilipinoDama services that reference this Privacy Policy. It does not apply to third-party websites or services that may be linked from the Service.',
        ],
      },
      {
        no: '3',
        heading: 'Definitions',
        paras: [
          'Personal Information — Information that identifies or can reasonably identify an individual, such as an email address or account identifier.',
          'Gameplay Data — Information generated while using the game including match history, rankings, guild memberships, achievements, quest progress, virtual inventory, and statistics.',
          'Technical Data — Information automatically collected from your browser or device, including IP address, browser type, operating system, language, timestamps, and diagnostic logs.',
          'Cookies — Small files stored on your browser that help maintain login sessions, preferences, security features, and site functionality.',
        ],
      },
      {
        no: '4',
        heading: 'Information We Collect',
        paras: [
          '§ 4.1 Information You Provide',
          'When creating or managing an account, we may collect your email address, username, password credentials (stored securely in hashed form by our authentication provider where applicable), profile information that you voluntarily submit, support requests, bug reports, feedback, and communications with customer support.',
          '§ 4.2 Gameplay Information',
          'To operate FilipinoDama we record gameplay information including match participation, wins and losses, ratings, leaderboard positions, AI matches, guild membership, friend relationships, achievements, quests, virtual currency balances, virtual items, disciplinary actions, and account history. This information is necessary to provide game functionality, prevent fraud, resolve disputes, and maintain competitive integrity.',
          '§ 4.3 Information Collected Automatically',
          'When you access the Service, we may automatically collect your IP address, browser type and version, operating system, device identifiers where available, time zone, login timestamps, pages visited, referring URLs, approximate geographic region derived from network information, error logs, security events, and performance diagnostics.',
          '§ 4.4 Cookies and Similar Technologies',
          'FilipinoDama uses cookies and similar technologies for authentication, remembering your preferences, maintaining secure sessions, detecting abuse, preventing unauthorized access, and improving performance. Essential cookies are required for core functionality. If optional analytics cookies are introduced in the future, we will provide appropriate notice where required by law.',
        ],
      },
      {
        no: '5',
        heading: 'Information We Do Not Intentionally Collect',
        paras: [
          'FilipinoDama does not intentionally collect payment card information because the Service does not currently sell virtual currency or accept payments for in-game purchases. We also do not knowingly request government-issued identification numbers unless required to comply with applicable law or to respond to a legal request.',
        ],
      },
      {
        no: '6',
        heading: 'How We Use Your Information',
        paras: [
          'We use the information we collect to create and manage accounts, authenticate users, operate matchmaking, maintain ranked leaderboards, synchronize game progress, provide guild and friends features, award achievements and quest rewards, deliver customer support, investigate abuse, detect cheating, maintain security, improve gameplay, troubleshoot technical issues, comply with legal obligations, and communicate important notices relating to the Service.',
        ],
      },
      {
        no: '7',
        heading: 'Legal Bases for Processing',
        paras: [
          'Where applicable, we process personal information because it is necessary to perform our contract with you when providing the Service, because we have legitimate interests in operating and securing FilipinoDama, because processing is required by applicable law, or because you have provided consent where consent is required.',
        ],
      },
      {
        no: '8',
        heading: 'Sharing of Information',
        paras: [
          '§ 8.1 We Do Not Sell Personal Information',
          'FilipinoDama does not sell your personal information to advertisers or data brokers.',
          '§ 8.2 Service Providers',
          'We may share limited information with trusted service providers that help operate the Service. These providers may include infrastructure and hosting providers such as Railway, authentication providers, email delivery providers, monitoring services, logging platforms, analytics services (if implemented), and customer support platforms. Each provider receives only the information reasonably necessary to perform its services.',
          '§ 8.3 Legal Requirements',
          'We may disclose information where required by law, court order, subpoena, or other lawful government request, or where disclosure is reasonably necessary to protect the rights, safety, property, or security of FilipinoDama, our users, or the public.',
        ],
      },
      {
        no: '9',
        heading: 'International Data Transfers',
        paras: [
          'Depending on the location of our infrastructure and service providers, your information may be processed or stored outside your country of residence. Where required by applicable law, we will take reasonable measures to ensure appropriate safeguards are in place for international transfers.',
        ],
      },
      {
        no: '10',
        heading: 'Data Retention',
        paras: [
          'We retain account information for as long as your account remains active and for a reasonable period afterward to resolve disputes, enforce our Terms of Service, investigate abuse, comply with legal obligations, maintain backups, and protect the integrity of ranked competition. We may anonymize or delete information that is no longer required. Some technical logs may be retained for shorter operational periods while security records may be retained longer where justified.',
        ],
      },
      {
        no: '11',
        heading: 'Security',
        paras: [
          'We implement administrative, technical, and organizational measures designed to protect personal information from unauthorized access, alteration, disclosure, or destruction. These measures may include encrypted communications (HTTPS), authentication controls, access restrictions, audit logging, server monitoring, routine software updates, and security reviews. Although we strive to protect your information, no Internet-connected system can guarantee absolute security.',
        ],
      },
      {
        no: '12',
        heading: 'Your Privacy Rights',
        paras: [
          'Subject to applicable law, you may request access to the personal information we maintain about you, request correction of inaccurate information, request deletion of your account, object to certain processing activities where permitted by law, or request a copy of information you have provided to us. We may verify your identity before fulfilling any request to protect the security of your account and other users.',
        ],
      },
      {
        no: '13',
        heading: 'Account Deletion',
        paras: [
          'You may request deletion of your FilipinoDama account through the official support channel or any future in-game account deletion feature. Deletion requests may result in permanent removal of your account profile, rankings, guild memberships, friends, achievements, virtual currency, virtual items, and other gameplay progress. Certain records may be retained where necessary to comply with legal obligations, resolve disputes, investigate fraud or cheating, enforce our Terms of Service, or maintain the integrity of historical match records.',
        ],
      },
      {
        no: '14',
        heading: 'Children\'s Privacy',
        paras: [
          'FilipinoDama is not intentionally directed toward children below the minimum age required by applicable law to create an online account without parental involvement. If we become aware that personal information has been collected in violation of applicable law, we will take reasonable steps to delete or restrict that information.',
        ],
      },
      {
        no: '15',
        heading: 'Managing Cookies',
        paras: [
          'Most web browsers allow you to control cookies through browser settings. Disabling essential cookies may affect your ability to sign in, maintain game sessions, or use certain features. Where optional cookies are introduced in the future, additional choices may be provided where required by law.',
        ],
      },
      {
        no: '16',
        heading: 'Philippine Data Privacy Act',
        paras: [
          'Where applicable, FilipinoDama endeavors to process personal information in accordance with Republic Act No. 10173 (Data Privacy Act of 2012) and its implementing rules and regulations. Users may exercise applicable rights by contacting us through the official privacy contact listed below once published.',
        ],
      },
      {
        no: '17',
        heading: 'International Users',
        paras: [
          'If you access FilipinoDama from outside the Philippines, you acknowledge that your information may be processed in jurisdictions where our infrastructure or service providers operate. We will implement reasonable safeguards appropriate to the nature of the processing and applicable legal requirements.',
        ],
      },
      {
        no: '18',
        heading: 'Changes to this Privacy Policy',
        paras: [
          'We may revise this Privacy Policy from time to time to reflect changes in the Service, security practices, legal requirements, or operational needs. Material updates will be announced through the website, account notifications, or other reasonable communication methods. The revised version becomes effective on the stated effective date.',
        ],
      },
      {
        no: '19',
        heading: 'Contact Information',
        paras: [
          'Questions about this policy? Contact our team at support@filipinodama.com, or write to Dama Royal Games Inc., Manila, Philippines. We respond within 30 days.',
        ],
      },
    ],
  },
  terms: {
    kicker: 'Terms',
    title: 'Terms of Service',
    updated: UPDATED,
    intro:
      'Welcome to FilipinoDama. These Terms of Service ("Terms") govern your access to and use of FilipinoDama, including its website, online multiplayer services, ranked matchmaking, artificial intelligence matches, guild system, leaderboards, virtual economy, in-game store, and all related services (collectively, the "Service").By creating an account, accessing the Service, or using any feature of FilipinoDama, you acknowledge that you have read, understood, and agree to be legally bound by these Terms. If you do not agree with these Terms, you must not access or use the Service. These Terms constitute a legally binding agreement between you and the operator of FilipinoDama ("Company", "we", "our", or "us").',
    sections: [
      {
        no: '2',
        heading: 'Definitions',
        paras: [
          'Account — A registered user profile used to access FilipinoDama. It includes login credentials, username, match history, rankings, friends, guild memberships, quests, achievements, virtual currency, and virtual inventory.',
          'Service — The website, browser game, matchmaking, ranked mode, AI matches, guild system, friends, leaderboards, virtual store, customer support, and future official applications.',
          'Virtual Currency — Digital coins earned only through gameplay, quests, achievements, or official events. They are not real money, have no cash value, cannot be redeemed, sold, or exchanged outside FilipinoDama.',
          'Virtual Item — Cosmetics, profile decorations, titles, badges, avatars, emotes, themes, or similar digital content licensed for use within the game.',
          'Ranked Match — A competitive multiplayer match that affects ratings or leaderboard standings.',
          'Guild — An in-game community of players. Guilds are features of the Service and do not create ownership rights.',
          'User Content — Content submitted by players, including usernames, guild names, profile text, support tickets, feedback, and chat.',
          'Company — Filipino Dama, the entity operating FilipinoDama.',
        ],
      },
      {
        no: '3',
        heading: 'Eligibility',
        paras: [
          'You must comply with applicable laws and have legal capacity to enter into this agreement. If required by law, you must have permission from a parent or legal guardian. You represent that registration information is accurate and will keep it updated.',
        ],
      },
      {
        no: '4',
        heading: 'Account Registration',
        paras: [
          'Registration may require an email address, username, password, and verification information. You may not impersonate another person, create misleading or offensive usernames, violate trademarks, or use automated registration tools. FilipinoDama may reject or require changes to usernames that violate these Terms.',
        ],
      },
      {
        no: '5',
        heading: 'Account Security',
        paras: [
          'You are responsible for protecting your login credentials. Use a strong password, safeguard your email account, and notify FilipinoDama immediately if you suspect unauthorized access. FilipinoDama will never ask for your password.',
        ],
      },
      {
        no: '6',
        heading: 'Account Ownership',
        paras: [
          'Accounts are licensed to you and remain part of the Service. Accounts may not be sold, transferred, rented, shared for competitive advantage, or used as collateral. Violations may result in permanent suspension.',
        ],
      },
      {
        no: '7',
        heading: 'License to Use the Service',
        paras: [
          'FilipinoDama grants you a limited, personal, non-exclusive, non-transferable, revocable license to use the Service for personal, non-commercial entertainment. You may not copy, modify, reverse engineer, scrape, distribute, or commercially exploit any part of the Service without written permission.',
        ],
      },
      {
        no: '8',
        heading: 'Acceptable Use',
        paras: [
          '§ 8.1 Personal License',
          'You may use FilipinoDama solely for your personal, non-commercial entertainment. You agree to use the Service in a manner that is lawful, respectful of other players, and consistent with these Terms.',
          '§ 8.2 Prohibited Activities',
          'You must not interfere with the operation of the Service or attempt to gain an unfair advantage. Prohibited conduct includes creating multiple accounts to evade sanctions, impersonating another person, abusing customer support, distributing malware, scraping game data without authorization, or attempting to access systems that are not intended for public use.',
          '§ 8.3 Communications',
          'If chat, guild chat, or messaging features are available, you may not post unlawful, threatening, defamatory, hateful, sexually explicit, discriminatory, or fraudulent content. Spam, unsolicited advertising, phishing attempts, and scams are prohibited.',
          '§ 8.4 Reports',
          'Users are encouraged to report violations in good faith. Knowingly submitting false reports to harass another player may itself be treated as a violation.',
        ],
      },
      {
        no: '9',
        heading: 'Fair Play',
        paras: [
          '§ 9.1 General Principle',
          'Every match must be played fairly. Players are expected to rely on their own skill and judgment. Any attempt to manipulate the outcome of a match or ranking system undermines the integrity of FilipinoDama.',
          '§ 9.2 Match Manipulation',
          'Players must not intentionally lose, collude with opponents, coordinate outcomes, queue simultaneously to influence rankings, or otherwise manipulate matchmaking.',
          '§ 9.3 Smurfing and Boosting',
          'Creating or using additional accounts to artificially influence rankings, boost another player\'s rating, or bypass matchmaking restrictions may result in sanctions.',
          '§ 9.4 Exploits',
          'If you discover a bug that provides an unfair advantage, you must report it promptly. Deliberately exploiting known bugs before they are fixed may result in match reversals, rating adjustments, suspension, or permanent account termination.',
        ],
      },
      {
        no: '10',
        heading: 'Anti-Cheat Policy',
        paras: [
          '§ 10.1 Prohibited Software',
          'The use of bots, scripts, macros, browser automation tools, modified clients, packet manipulation tools, memory editing software, or similar technologies designed to automate gameplay or gain an unfair advantage is strictly prohibited.',
          '§ 10.2 Investigations',
          'FilipinoDama may review server logs, gameplay records, match histories, connection information, and other technical evidence when investigating suspected cheating. The Company is not required to disclose the methods used to detect or investigate cheating.',
          '§ 10.3 Enforcement',
          'Depending on the severity of the violation, enforcement actions may include warnings, temporary suspensions, permanent bans, removal from leaderboards, reversal of match results, forfeiture of virtual rewards, guild removal, or any combination of these actions.',
        ],
      },
      {
        no: '11',
        heading: 'Player Conduct',
        paras: [
          '§ 11.1 Respect for Others',
          'Players must treat others with respect. Harassment, discrimination, threats, doxxing, stalking, hate speech, and targeted abuse are prohibited.',
          '§ 11.2 Usernames and Guild Names',
          'Usernames and guild names must not be offensive, misleading, infringe intellectual property rights, impersonate public figures, or encourage illegal activity. FilipinoDama may require a name change or remove content that violates this policy.',
          '§ 11.3 Real-Money Trading',
          'Virtual currency and virtual items may not be sold, exchanged for cash, or traded outside the official game systems. Any attempt to engage in real-money trading may result in permanent account action.',
          '§ 11.4 Appeals',
          'Players may contact support to request a review of enforcement actions. Submission of an appeal does not guarantee reversal, and repeated abusive appeals may be declined.',
        ],
      },
      {
        no: '12',
        heading: 'Ranked Matches and Leaderboards',
        paras: [
          '§ 12.1 Ranked Competition',
          'Ranked Matches are intended to measure player skill through FilipinoDama\'s matchmaking and rating systems. Participation is optional. By entering Ranked Matches, you agree that your rating, rank, win-loss record, and leaderboard position may be publicly displayed.',
          '§ 12.2 Rating Adjustments',
          'FilipinoDama may modify, recalculate, or reset ratings where technical errors, exploits, cheating, collusion, or system changes affect competitive integrity. Rating formulas are proprietary and may change without prior notice.',
          '§ 12.3 Seasons',
          'Competitive play may be divided into seasons. At the end of a season, rankings may be reset in whole or in part, rewards distributed according to eligibility, and inactive accounts archived from seasonal leaderboards.',
          '§ 12.4 Disconnects',
          'If a player disconnects, the server will determine the match outcome according to the applicable game rules and technical conditions. Intentional disconnects to avoid losses may result in penalties.',
          '§ 12.5 Competitive Integrity',
          'The Company reserves the right to remove players from leaderboards, invalidate matches, or withhold seasonal rewards where there is reasonable evidence of manipulation or unfair play.',
        ],
      },
      {
        no: '13',
        heading: 'Guild System',
        paras: [
          '§ 13.1 Guild Creation',
          'Eligible players may create or join guilds subject to gameplay requirements. Guild names, emblems, and descriptions must comply with these Terms.',
          '§ 13.2 Guild Leadership',
          'Guild leaders are responsible for managing membership and permissions. FilipinoDama may transfer or dissolve inactive guilds where necessary to maintain the Service.',
          '§ 13.3 Guild Conduct',
          'Guilds may not be used to organize cheating, harassment, scams, hate groups, or other prohibited activity. Entire guilds may face moderation where coordinated misconduct occurs.',
          '§ 13.4 Guild Content',
          'Guild names, descriptions, announcements, and uploaded content may be moderated or removed if they violate these Terms.',
        ],
      },
      {
        no: '14',
        heading: 'Friends and Social Features',
        paras: [
          '§ 14.1 Friends List',
          'The Service may allow players to add or remove friends. Players are responsible for deciding whom they interact with.',
          '§ 14.2 Blocking',
          'Where available, blocking tools may be used to limit unwanted interactions. Blocking does not guarantee that all future interactions will be prevented.',
          '§ 14.3 Social Safety',
          'Do not share passwords, financial information, government-issued identification numbers, or other sensitive personal information with other players.',
        ],
      },
      {
        no: '15',
        heading: 'Virtual Currency and Virtual Store',
        paras: [
          '§ 15.1 Earning Virtual Currency',
          'Virtual Currency is earned only through gameplay, quests, achievements, seasonal rewards, or official events designated by FilipinoDama. No feature currently permits purchasing Virtual Currency using real money.',
          '§ 15.2 Ownership',
          'Virtual Currency and Virtual Items are licensed for use within the Service. They have no real-world monetary value and do not constitute personal property.',
          '§ 15.3 Restrictions',
          'Virtual Currency and Virtual Items may not be redeemed for cash, exchanged outside the Service, sold for real-world consideration, or transferred except through features expressly provided by FilipinoDama.',
          '§ 15.4 Game Balance',
          'To preserve fair gameplay, FilipinoDama may introduce new items, retire existing items, adjust prices, modify rewards, or rebalance the virtual economy at any time.',
        ],
      },
      {
        no: '16',
        heading: 'Intellectual Property',
        paras: [
          '§ 16.1 Ownership',
          'All rights, title, and interest in FilipinoDama, including the source code, game logic, original artwork, animations, sound effects, music, user interface, databases, logos, trademarks, text, graphics, and other original content are owned by the Company or its licensors. These Terms do not transfer ownership of any intellectual property to you.',
          '§ 16.2 Traditional Game',
          'FilipinoDama does not claim ownership over the traditional rules of Dama. However, the Company\'s original implementation, software, artwork, visual assets, branding, balancing, game systems, original content, and presentation are protected by applicable intellectual property laws.',
          '§ 16.3 User License',
          'You may not copy, reproduce, distribute, modify, create derivative works from, publicly display, commercially exploit, reverse engineer, or otherwise use any protected content except as expressly permitted by law or with the Company\'s written consent.',
          '§ 16.4 Streaming',
          'You may stream or upload gameplay videos for non-commercial or monetized creator content provided such content does not falsely imply sponsorship, distribute cheats, or infringe the rights of others. The Company may publish separate creator guidelines.',
        ],
      },
      {
        no: '17',
        heading: 'User Content',
        paras: [
          '§ 17.1 Ownership',
          'You retain ownership of content you create and submit, such as profile biographies or support requests. By submitting User Content, you grant the Company a worldwide, non-exclusive, royalty-free license to host, reproduce, display, adapt, and use that content solely for operating, improving, securing, and promoting the Service.',
          '§ 17.2 Moderation',
          'The Company may remove, restrict, edit, or refuse User Content that violates these Terms or applicable law.',
          '§ 17.3 Responsibility',
          'You represent that you have the rights necessary to submit your User Content and that it does not infringe the rights of any third party.',
        ],
      },
      {
        no: '18',
        heading: 'Service Availability',
        paras: [
          '§ 18.1 Maintenance',
          'The Service may occasionally be unavailable because of maintenance, updates, security incidents, infrastructure failures, or events beyond the Company\'s reasonable control.',
          '§ 18.2 No Guarantee',
          'The Company does not guarantee uninterrupted availability, error-free operation, or that every game session will complete successfully. Reasonable efforts will be made to maintain reliable service.',
          '§ 18.3 Updates',
          'The Company may modify features, rebalance gameplay, introduce new content, remove obsolete features, or discontinue parts of the Service to improve security, performance, or player experience.',
        ],
      },
      {
        no: '19',
        heading: 'Suspension and Termination',
        paras: [
          '§ 19.1 Suspension',
          'The Company may temporarily suspend an Account while investigating suspected violations, fraud, security incidents, or other conduct that threatens the integrity of the Service.',
          '§ 19.2 Permanent Termination',
          'Accounts may be permanently terminated for serious or repeated violations, including cheating, account sales, real-money trading, harassment, illegal activity, or attempts to compromise the Service.',
          '§ 19.3 Effect',
          'Upon termination, access to the Service, virtual currency, virtual items, rankings, guild privileges, and other account benefits may be revoked without compensation, subject to applicable law.',
        ],
      },
      {
        no: '20',
        heading: 'Appeals',
        paras: [
          '§ 20.1 Request for Review',
          'If your account is suspended or restricted, you may submit one appeal through the official support channel. Include your username, the action being appealed, and any relevant information. Filing an appeal does not automatically suspend enforcement.',
          '§ 20.2 Review Process',
          'The Company will review available evidence including server logs, match history, and technical records. Decisions made after review are final unless the Company elects to reopen the case.',
        ],
      },
      {
        no: '21',
        heading: 'Disclaimers',
        paras: [
          '§ 21.1 As-Is Service',
          'The Service is provided on an \'as is\' and \'as available\' basis to the fullest extent permitted by law. We do not warrant uninterrupted availability, error-free operation, or compatibility with every device or browser.',
        ],
      },
      {
        no: '22',
        heading: 'Limitation of Liability',
        paras: [
          '§ 22.1 Limitation',
          'To the maximum extent permitted by applicable law, the Company will not be liable for indirect, incidental, consequential, special, or punitive damages arising from your use of the Service, including loss of data, rankings, virtual items, or gameplay progress resulting from outages, maintenance, or security incidents.',
        ],
      },
      {
        no: '23',
        heading: 'Indemnification',
        paras: [
          '§ 23.1 User Responsibility',
          'You agree to indemnify and hold the Company harmless from claims, losses, liabilities, and reasonable expenses arising from your violation of these Terms or misuse of the Service.',
        ],
      },
      {
        no: '24',
        heading: 'Governing Law',
        paras: [
          '§ 24.1 Applicable Law',
          'Unless otherwise required by applicable law, these Terms are governed by the laws of the Republic of the Philippines. Courts with proper jurisdiction in the Philippines shall have jurisdiction over disputes relating to these Terms.',
        ],
      },
      {
        no: '25',
        heading: 'Amendments',
        paras: [
          '§ 25.1 Changes',
          'The Company may update these Terms to reflect new features, legal requirements, or operational changes. Material updates will be announced through the website or other reasonable means. Continued use of the Service after the effective date constitutes acceptance of the revised Terms.',
        ],
      },
      {
        no: '26',
        heading: 'Contact',
        paras: [
          'Questions about this policy? Contact our team at support@filipinodama.com, or write to Dama Royal Games Inc., Manila, Philippines. We respond within 30 days.',
        ],
      },
    ],
  },
  community: {
    kicker: 'Conduct',
    title: 'Community Guidelines',
    updated: UPDATED,
    intro:
      'FilipinoDama exists to provide a fun, competitive, and respectful environment where players can enjoy the traditional game of Dama online. Every player shares responsibility for maintaining a welcoming community. These Community Guidelines apply to all interactions within FilipinoDama, including usernames, profiles, guilds, chat features, support requests, and any future official community spaces.',
    sections: [
      {
        no: '2',
        heading: 'Respect Other Players',
        paras: [
          'Treat all players with courtesy regardless of skill level, nationality, language, religion, gender, or personal background. Healthy competition is encouraged; personal attacks are not. You may celebrate victories and discuss strategy, but you must not harass, intimidate, threaten, or deliberately target another player with abusive behavior.',
        ],
      },
      {
        no: '3',
        heading: 'Harassment and Abuse',
        paras: [
          'The following behaviors are prohibited:',
          '• Threats of violence or self-harm.',
          '• Hate speech or discriminatory language.',
          '• Bullying, stalking, or repeated unwanted contact.',
          '• Sharing another person\'s personal information (doxxing).',
          '• Sexual harassment or explicit sexual content.',
          '• Encouraging other players to harass an individual or guild. Violations may result in warnings, chat restrictions, suspensions, or permanent account termination depending on severity.',
        ],
      },
      {
        no: '4',
        heading: 'Usernames, Profiles, and Guild Names',
        paras: [
          'Usernames, profile biographies, guild names, guild descriptions, and future custom content must not contain profanity directed at others, hate symbols, impersonation of public figures or FilipinoDama staff, trademarks used without authorization, misleading information, or illegal content. FilipinoDama may require changes without prior notice.',
        ],
      },
      {
        no: '5',
        heading: 'Fair Communication',
        paras: [
          'Constructive criticism, strategy discussions, and friendly banter are welcome. Spam, flooding, repeated unsolicited advertisements, phishing attempts, scam links, malware distribution, chain messages, and impersonation are prohibited. If chat features are expanded in the future, these standards will continue to apply.',
        ],
      },
      {
        no: '6',
        heading: 'Ranked Match Conduct',
        paras: [
          'Ranked matches are designed to reflect player skill. Enter every ranked game with the intention of competing fairly. Intentionally losing, colluding with opponents, queue manipulation, win trading, boosting, account sharing, or any attempt to manipulate rankings is prohibited. Players should complete matches whenever reasonably possible and avoid intentional disconnections.',
        ],
      },
      {
        no: '7',
        heading: 'Guild Conduct',
        paras: [
          'Guilds should promote teamwork and positive community interaction. Guild leaders are encouraged to moderate their communities responsibly. Guilds may not be used to organize cheating, harassment, hate groups, scams, real-money trading, or coordinated abuse. FilipinoDama may remove guild content or disband guilds involved in serious violations.',
        ],
      },
      {
        no: '8',
        heading: 'Reporting Players',
        paras: [
          'If you believe another player has violated these Guidelines or the Terms of Service, submit a report using official reporting tools when available. Include accurate information whenever possible. Reports should be made in good faith and not as retaliation for losing a match.',
        ],
      },
      {
        no: '9',
        heading: 'False Reports',
        paras: [
          'Knowingly submitting false or malicious reports, fabricating evidence, or repeatedly abusing the reporting system may result in disciplinary action. Abuse of moderation resources harms the community and may itself constitute misconduct.',
        ],
      },
      {
        no: '10',
        heading: 'Enforcement',
        paras: [
          'Depending on the severity, frequency, and impact of a violation, FilipinoDama may issue educational warnings, temporary chat restrictions, temporary suspensions, permanent account bans, removal from leaderboards, guild sanctions, content removal, or other reasonable enforcement measures. Serious violations may bypass progressive discipline.',
        ],
      },
      {
        no: '11',
        heading: 'Appeals',
        paras: [
          'Players may submit an appeal through the official support process. Appeals should include relevant information supporting the request. The Company will review available evidence and may uphold, modify, or reverse enforcement actions at its discretion.',
        ],
      },
      {
        no: '12',
        heading: 'Positive Community',
        paras: [
          'Players are encouraged to welcome new members, report bugs responsibly, assist others in learning the game, participate respectfully in community events, and help create a friendly environment that reflects good sportsmanship.',
        ],
      },
    ],
  },
  anticheat: {
    kicker: 'Fair Play',
    title: 'Fair Play & Anti-Cheat Policy',
    updated: UPDATED,
    intro:
      'This Fair Play & Anti-Cheat Policy explains the standards expected of every FilipinoDama player. It supplements the Terms of Service and Community Guidelines by defining prohibited conduct, how investigations may be performed, and the actions that may be taken to preserve competitive integrity.',
    sections: [
      {
        no: '2',
        heading: 'Core Principle of Fair Play',
        paras: [
          'Every ranked and casual match should be decided by player skill, strategy, and legitimate gameplay. Any action intended to obtain an unfair advantage over another player or manipulate the outcome of a match is prohibited regardless of whether third-party software is used.',
        ],
      },
      {
        no: '3',
        heading: 'Prohibited Conduct',
        paras: [
          'The following activities are prohibited:',
          '• Bots or automated gameplay.',
          '• Macros or scripts that perform game actions automatically.',
          '• Browser automation tools that interact with the game.',
          '• Modified game clients or altered JavaScript intended to bypass game rules.',
          '• Packet manipulation, request replay, or unauthorized API-style interaction.',
          '• Exploiting software bugs after discovering they provide an unfair advantage.',
          '• Reverse engineering the Service for the purpose of cheating.',
          '• Circumventing account penalties through alternate accounts.',
        ],
      },
      {
        no: '4',
        heading: 'Ranked Competition Violations',
        paras: [
          'The following conduct specifically undermines ranked play and is prohibited:',
          '• Win trading.',
          '• Queue sniping to manipulate matchmaking.',
          '• Rating boosting.',
          '• Smurfing for the purpose of abusing lower-ranked players or manipulating ratings.',
          '• Account sharing.',
          '• Intentionally losing to influence another player\'s ranking.',
          '• Coordinating results with other players or guilds.',
        ],
      },
      {
        no: '5',
        heading: 'Bug Reporting',
        paras: [
          'Players who discover a gameplay or security issue should report it through official support channels. Good-faith reporting will not result in penalties. Deliberately exploiting a bug after becoming aware that it provides an unfair advantage may result in disciplinary action, including reversal of affected match results.',
        ],
      },
      {
        no: '6',
        heading: 'Investigations',
        paras: [
          'FilipinoDama may investigate suspected cheating using server-side records, match logs, gameplay statistics, connection history, player reports, and other technical information reasonably necessary to evaluate potential violations. Investigations may occur before or after enforcement. To preserve the effectiveness of anti-cheat systems, FilipinoDama is not obligated to disclose detection methods, evidence thresholds, or internal investigative procedures.',
        ],
      },
      {
        no: '7',
        heading: 'Server Authority',
        paras: [
          'For competitive integrity, server-side records take precedence over client-side information whenever a discrepancy exists. Match results, rankings, quest completion, virtual currency awards, and disciplinary actions may be based on server records even if a player\'s local device displays different information.',
        ],
      },
      {
        no: '8',
        heading: 'Detection Methods',
        paras: [
          'FilipinoDama may identify suspicious behavior through automated systems, statistical analysis, abnormal gameplay patterns, integrity checks, player reports, manual review, and other security techniques. The Company may update these methods without notice. Attempting to discover or circumvent detection systems is itself a violation of this Policy.',
        ],
      },
      {
        no: '9',
        heading: 'Enforcement Matrix',
        paras: [
          'Enforcement depends on the seriousness and frequency of the violation. Possible actions include educational warnings, removal of illegitimate rewards, rating adjustments, match reversals, temporary suspensions, permanent account bans, guild sanctions, leaderboard removal, and restriction from future competitive events. Severe cheating may result in immediate permanent enforcement without prior warning.',
        ],
      },
      {
        no: '10',
        heading: 'Appeals',
        paras: [
          'Players who believe enforcement was issued in error may submit one appeal through the official support process. Appeals should be factual and include relevant information. During review, enforcement generally remains in effect. Repeated abusive or duplicate appeals may be declined.',
        ],
      },
      {
        no: '11',
        heading: 'Responsible Security Disclosure',
        paras: [
          'Security researchers acting in good faith are encouraged to report vulnerabilities privately rather than exploiting or publicly disclosing them before a fix is available. Good-faith reports intended to improve the security of FilipinoDama will be reviewed. This provision does not authorize unauthorized access, data extraction, denial-of-service activity, or other unlawful conduct.',
        ],
      },
    ],
  },
  data: {
    kicker: 'Your Data',
    title: 'Data & Account Controls',
    updated: UPDATED,
    intro:
      'This section summarizes what data the game handles and how to exercise your controls — including account and data deletion, which we make easy to find and use, as required by app-store policy.',
    sections: [
      {
        no: '1',
        heading: 'Data Safety Summary',
        paras: [
          'Collected and linked to you: display name, player tag, avatar, email (if you use social sign-in), gameplay stats, virtual currency and items, and friend/guild activity.',
          'Collected for functionality and security: device and diagnostic data, and chat messages needed to deliver them and enforce our rules. We do not sell your data, and we do not use your data for third-party advertising without your consent.',
        ],
      },
      {
        no: '2',
        heading: 'Delete Your Account',
        paras: [
          'You can request permanent deletion of your account and associated personal data in-app: open Settings → Account → Delete Account, and confirm. You can also request deletion by emailing support@filipinodama.com from your registered address. We complete verified deletion requests within 30 days, except data we must keep for legal, security, or fraud-prevention reasons.',
        ],
      },
      {
        no: '3',
        heading: 'Request or Export Your Data',
        paras: [
          'You may request a copy of the personal data associated with your account. Contact support@filipinodama.com and we will verify your identity and provide an export in a portable format within the time required by law.',
        ],
      },
      {
        no: '4',
        heading: 'Manage Permissions',
        paras: [
          'You control device permissions (such as notifications) in your operating system or browser settings. Revoking a permission may limit related features. FilipinoDama plays in your browser and does not require special device access to function.',
        ],
      },
      {
        no: '5',
        heading: 'Regional Rights',
        paras: [
          'Under the Philippine Data Privacy Act, and — for visitors from those regions — laws such as the GDPR and CCPA/CPRA, you have rights including access, correction, deletion, portability, and the right to lodge a complaint with a regulator. We honour these rights regardless of where you live.',
        ],
      },
    ],
  },
};

const TABS: { key: LegalKey; label: string; icon: string; to: string }[] = [
  { key: "privacy", label: "Privacy Policy", icon: "🔒", to: "/privacy" },
  { key: "terms", label: "Terms of Service", icon: "📜", to: "/terms" },
  { key: "community", label: "Community Guidelines", icon: "🤝", to: "/community" },
  { key: "anticheat", label: "Fair Play & Anti-Cheat", icon: "🛡️", to: "/anti-cheat" },
  { key: "data", label: "Data & Account", icon: "🗂️", to: "/data" },
];

/** Render one paragraph: `§ ` → bold sub-clause heading; `• ` → bullet; else body. */
function Para({ text }: { text: string }) {
  if (text.startsWith("§ ")) {
    return (
      <div style={{ font: "800 13px Inter", color: "var(--gold-lt)", marginTop: 6 }}>
        {text.slice(2)}
      </div>
    );
  }
  if (text.startsWith("• ")) {
    return (
      <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
        <span style={{ color: "var(--gold)", flex: "none" }}>•</span>
        <span style={{ font: "400 14px/1.65 Inter", color: "var(--ink)", textWrap: "pretty" }}>
          {text.slice(2)}
        </span>
      </div>
    );
  }
  return (
    <p style={{ margin: 0, font: "400 14px/1.65 Inter", color: "var(--ink)", textWrap: "pretty" }}>
      {text}
    </p>
  );
}

export function LegalLayout({ active }: { active: LegalKey }) {
  const navigate = useNavigate();
  const legalDoc = LEGAL_DATA[active];

  return (
    <div
      data-screen-label="Legal"
      className="fd-stack fd-page-pad"
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: 26,
        display: "grid",
        gridTemplateColumns: "250px minmax(0,1fr)",
        gap: 22,
        alignItems: "start",
      }}
    >
      {/* NAV */}
      <div className="frame fd-order-2" style={{ padding: 16, position: "sticky", top: 88 }}>
        <div className="ptitle" style={{ textAlign: "left" }}>
          Legal &amp; Policies
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {TABS.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => navigate(t.to)}
                style={{
                  width: "100%",
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "11px 12px",
                  borderRadius: 9,
                  border: `1px solid ${on ? "rgba(232,184,75,.4)" : "transparent"}`,
                  background: on ? "rgba(232,184,75,.12)" : "transparent",
                  color: on ? "var(--gold-lt)" : "var(--ink)",
                  font: "700 13px Inter",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 15 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(63,191,111,.25)",
            background: "rgba(63,191,111,.08)",
          }}
        >
          <div
            style={{
              font: "700 10px Inter",
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#7ee6a4",
              marginBottom: 5,
            }}
          >
            Privacy First
          </div>
          <div style={{ font: "500 11px/1.5 Inter", color: "var(--ink2)" }}>
            Built to respect your data — compliant with the Philippine Data Privacy Act, and, where applicable, the GDPR and CCPA.
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="frame fd-order-1 fd-card-m" style={{ padding: "32px 36px" }}>
        <span
          style={{
            display: "inline-block",
            padding: "5px 12px",
            borderRadius: 100,
            border: "1px solid var(--gold)",
            color: "var(--gold-lt)",
            font: "700 10px Inter",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          {legalDoc.kicker}
        </span>
        <h1
          style={{
            margin: "14px 0 6px",
            font: "800 clamp(24px,2.6vw,34px) Cinzel,serif",
            color: "var(--gold-lt)",
          }}
        >
          {legalDoc.title}
        </h1>
        <div
          style={{
            font: "600 12px 'JetBrains Mono',monospace",
            color: "var(--ink2)",
            marginBottom: 20,
          }}
        >
          Last updated {legalDoc.updated}
        </div>
        <p
          style={{
            margin: "0 0 24px",
            font: "400 15px/1.7 Inter",
            color: "var(--ink)",
            textWrap: "pretty",
          }}
        >
          {legalDoc.intro}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {legalDoc.sections.map((sec) => (
            <section key={sec.no}>
              <h2
                style={{
                  margin: "0 0 10px",
                  font: "800 17px Inter",
                  color: "#fff",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                }}
              >
                <span style={{ font: "800 13px 'JetBrains Mono',monospace", color: "var(--gold)" }}>
                  {sec.no}
                </span>
                {sec.heading}
              </h2>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  paddingLeft: 2,
                }}
              >
                {sec.paras.map((para, i) => (
                  <Para key={i} text={para} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <div
          style={{
            marginTop: 28,
            padding: "18px 20px",
            borderRadius: 12,
            border: "1px solid rgba(232,184,75,.2)",
            background: "rgba(0,0,0,.22)",
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 22, flex: "none" }}>📧</span>
          <div>
            <div style={{ font: "700 13px Inter", color: "var(--gold-lt)", marginBottom: 3 }}>
              Questions about these policies?
            </div>
            <div style={{ font: "400 13px/1.6 Inter", color: "var(--ink2)" }}>
              Contact our team at <span style={{ color: "var(--gold-lt)" }}>support@filipinodama.com</span> or write to
              Dama Royal Games Inc., Manila, Philippines. We respond within 30 days.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LegalLayout;
