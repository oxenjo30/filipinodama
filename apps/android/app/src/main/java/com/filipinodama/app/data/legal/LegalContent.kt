package com.filipinodama.app.data.legal

/**
 * Legal document copy, transcribed VERBATIM from
 * apps/web/src/features/legal/LegalLayout.tsx `LEGAL_DATA` (the compiled
 * legal text the web client already renders at /privacy, /terms,
 * /community, /anti-cheat, /data). This is the single 1:1 source of truth
 * for those five documents — do not paraphrase or invent copy here; any
 * future change must be applied to BOTH apps/web's LEGAL_DATA and this file
 * to keep them identical, exactly like SYSTEM_STATES.md instructs for the
 * shared system-state copy.
 *
 * Paragraph convention preserved from web's `Para` renderer:
 *   "§ " prefix -> bold sub-clause heading
 *   "•  " prefix -> bullet item
 *   otherwise -> plain paragraph
 */

data class LegalSection(val no: String, val heading: String, val paras: List<String>)
data class LegalDoc(val kicker: String, val title: String, val updated: String, val intro: String, val sections: List<LegalSection>)

private const val UPDATED = "July 8, 2026"

val LEGAL_DOCS: Map<String, LegalDoc> = mapOf(
    "privacy" to LegalDoc(
        kicker = "Privacy",
        title = "Privacy Policy",
        updated = UPDATED,
        intro = "This Privacy Policy explains how FilipinoDama (\"we\", \"our\", or \"us\") collects, uses, stores, protects, and discloses information when you access or use FilipinoDama, including the browser-based game, ranked matchmaking, AI matches, guild system, leaderboards, virtual store, support services, and related features. Your privacy is important to us. We are committed to processing personal information responsibly and in accordance with applicable laws, including the Philippine Data Privacy Act of 2012 where applicable. By creating an account or using the Service, you acknowledge that you have read this Privacy Policy.",
        sections = listOf(
            LegalSection("2", "Scope", listOf(
                "This Privacy Policy applies to information collected through FilipinoDama.com and any future official FilipinoDama services that reference this Privacy Policy. It does not apply to third-party websites or services that may be linked from the Service."
            )),
            LegalSection("3", "Definitions", listOf(
                "Personal Information — Information that identifies or can reasonably identify an individual, such as an email address or account identifier.",
                "Gameplay Data — Information generated while using the game including match history, rankings, guild memberships, achievements, quest progress, virtual inventory, and statistics.",
                "Technical Data — Information automatically collected from your browser or device, including IP address, browser type, operating system, language, timestamps, and diagnostic logs.",
                "Cookies — Small files stored on your browser that help maintain login sessions, preferences, security features, and site functionality."
            )),
            LegalSection("4", "Information We Collect", listOf(
                "§ 4.1 Information You Provide",
                "When creating or managing an account, we may collect your email address, username, password credentials (stored securely in hashed form by our authentication provider where applicable), profile information that you voluntarily submit, support requests, bug reports, feedback, and communications with customer support.",
                "§ 4.2 Gameplay Information",
                "To operate FilipinoDama we record gameplay information including match participation, wins and losses, ratings, leaderboard positions, AI matches, guild membership, friend relationships, achievements, quests, virtual currency balances, virtual items, disciplinary actions, and account history. This information is necessary to provide game functionality, prevent fraud, resolve disputes, and maintain competitive integrity.",
                "§ 4.3 Information Collected Automatically",
                "When you access the Service, we may automatically collect your IP address, browser type and version, operating system, device identifiers where available, time zone, login timestamps, pages visited, referring URLs, approximate geographic region derived from network information, error logs, security events, and performance diagnostics.",
                "§ 4.4 Cookies and Similar Technologies",
                "FilipinoDama uses cookies and similar technologies for authentication, remembering your preferences, maintaining secure sessions, detecting abuse, preventing unauthorized access, and improving performance. Essential cookies are required for core functionality. If optional analytics cookies are introduced in the future, we will provide appropriate notice where required by law."
            )),
            LegalSection("5", "Information We Do Not Intentionally Collect", listOf(
                "FilipinoDama does not intentionally collect payment card information because the Service does not currently sell virtual currency or accept payments for in-game purchases. We also do not knowingly request government-issued identification numbers unless required to comply with applicable law or to respond to a legal request."
            )),
            LegalSection("6", "How We Use Your Information", listOf(
                "We use the information we collect to create and manage accounts, authenticate users, operate matchmaking, maintain ranked leaderboards, synchronize game progress, provide guild and friends features, award achievements and quest rewards, deliver customer support, investigate abuse, detect cheating, maintain security, improve gameplay, troubleshoot technical issues, comply with legal obligations, and communicate important notices relating to the Service."
            )),
            LegalSection("7", "Legal Bases for Processing", listOf(
                "Where applicable, we process personal information because it is necessary to perform our contract with you when providing the Service, because we have legitimate interests in operating and securing FilipinoDama, because processing is required by applicable law, or because you have provided consent where consent is required."
            )),
            LegalSection("8", "Sharing of Information", listOf(
                "§ 8.1 We Do Not Sell Personal Information",
                "FilipinoDama does not sell your personal information to advertisers or data brokers.",
                "§ 8.2 Service Providers",
                "We may share limited information with trusted service providers that help operate the Service. These providers may include infrastructure and hosting providers such as Railway, authentication providers, email delivery providers, monitoring services, logging platforms, analytics services (if implemented), and customer support platforms. Each provider receives only the information reasonably necessary to perform its services.",
                "§ 8.3 Legal Requirements",
                "We may disclose information where required by law, court order, subpoena, or other lawful government request, or where disclosure is reasonably necessary to protect the rights, safety, property, or security of FilipinoDama, our users, or the public."
            )),
            LegalSection("9", "International Data Transfers", listOf(
                "Depending on the location of our infrastructure and service providers, your information may be processed or stored outside your country of residence. Where required by applicable law, we will take reasonable measures to ensure appropriate safeguards are in place for international transfers."
            )),
            LegalSection("10", "Data Retention", listOf(
                "We retain account information for as long as your account remains active and for a reasonable period afterward to resolve disputes, enforce our Terms of Service, investigate abuse, comply with legal obligations, maintain backups, and protect the integrity of ranked competition. We may anonymize or delete information that is no longer required. Some technical logs may be retained for shorter operational periods while security records may be retained longer where justified."
            )),
            LegalSection("11", "Security", listOf(
                "We implement administrative, technical, and organizational measures designed to protect personal information from unauthorized access, alteration, disclosure, or destruction. These measures may include encrypted communications (HTTPS), authentication controls, access restrictions, audit logging, server monitoring, routine software updates, and security reviews. Although we strive to protect your information, no Internet-connected system can guarantee absolute security."
            )),
            LegalSection("12", "Your Privacy Rights", listOf(
                "Subject to applicable law, you may request access to the personal information we maintain about you, request correction of inaccurate information, request deletion of your account, object to certain processing activities where permitted by law, or request a copy of information you have provided to us. We may verify your identity before fulfilling any request to protect the security of your account and other users."
            )),
            LegalSection("13", "Account Deletion", listOf(
                "You may request deletion of your FilipinoDama account through the official support channel or any future in-game account deletion feature. Deletion requests may result in permanent removal of your account profile, rankings, guild memberships, friends, achievements, virtual currency, virtual items, and other gameplay progress. Certain records may be retained where necessary to comply with legal obligations, resolve disputes, investigate fraud or cheating, enforce our Terms of Service, or maintain the integrity of historical match records."
            )),
            LegalSection("14", "Children's Privacy", listOf(
                "FilipinoDama is not intentionally directed toward children below the minimum age required by applicable law to create an online account without parental involvement. If we become aware that personal information has been collected in violation of applicable law, we will take reasonable steps to delete or restrict that information."
            )),
            LegalSection("15", "Managing Cookies", listOf(
                "Most web browsers allow you to control cookies through browser settings. Disabling essential cookies may affect your ability to sign in, maintain game sessions, or use certain features. Where optional cookies are introduced in the future, additional choices may be provided where required by law."
            )),
            LegalSection("16", "Philippine Data Privacy Act", listOf(
                "Where applicable, FilipinoDama endeavors to process personal information in accordance with Republic Act No. 10173 (Data Privacy Act of 2012) and its implementing rules and regulations. Users may exercise applicable rights by contacting us through the official privacy contact listed below once published."
            )),
            LegalSection("17", "International Users", listOf(
                "If you access FilipinoDama from outside the Philippines, you acknowledge that your information may be processed in jurisdictions where our infrastructure or service providers operate. We will implement reasonable safeguards appropriate to the nature of the processing and applicable legal requirements."
            )),
            LegalSection("18", "Changes to this Privacy Policy", listOf(
                "We may revise this Privacy Policy from time to time to reflect changes in the Service, security practices, legal requirements, or operational needs. Material updates will be announced through the website, account notifications, or other reasonable communication methods. The revised version becomes effective on the stated effective date."
            )),
            LegalSection("19", "Contact Information", listOf(
                "Questions about this policy? Contact our team at support@filipinodama.com, or write to Dama Royal Games Inc., Manila, Philippines. We respond within 30 days."
            ))
        )
    ),
    "terms" to LegalDoc(
        kicker = "Terms",
        title = "Terms of Service",
        updated = UPDATED,
        intro = "Welcome to FilipinoDama. These Terms of Service (\"Terms\") govern your access to and use of FilipinoDama, including its website, online multiplayer services, ranked matchmaking, artificial intelligence matches, guild system, leaderboards, virtual economy, in-game store, and all related services (collectively, the \"Service\"). By creating an account, accessing the Service, or using any feature of FilipinoDama, you acknowledge that you have read, understood, and agree to be legally bound by these Terms. If you do not agree with these Terms, you must not access or use the Service. These Terms constitute a legally binding agreement between you and the operator of FilipinoDama (\"Company\", \"we\", \"our\", or \"us\").",
        sections = listOf(
            LegalSection("2", "Definitions", listOf(
                "Account — A registered user profile used to access FilipinoDama. It includes login credentials, username, match history, rankings, friends, guild memberships, quests, achievements, virtual currency, and virtual inventory.",
                "Service — The website, browser game, matchmaking, ranked mode, AI matches, guild system, friends, leaderboards, virtual store, customer support, and future official applications.",
                "Virtual Currency — Digital coins earned only through gameplay, quests, achievements, or official events. They are not real money, have no cash value, cannot be redeemed, sold, or exchanged outside FilipinoDama.",
                "Virtual Item — Cosmetics, profile decorations, titles, badges, avatars, emotes, themes, or similar digital content licensed for use within the game.",
                "Ranked Match — A competitive multiplayer match that affects ratings or leaderboard standings.",
                "Guild — An in-game community of players. Guilds are features of the Service and do not create ownership rights.",
                "User Content — Content submitted by players, including usernames, guild names, profile text, support tickets, feedback, and chat.",
                "Company — Filipino Dama, the entity operating FilipinoDama."
            )),
            LegalSection("3", "Eligibility", listOf(
                "You must comply with applicable laws and have legal capacity to enter into this agreement. If required by law, you must have permission from a parent or legal guardian. You represent that registration information is accurate and will keep it updated."
            )),
            LegalSection("4", "Account Registration", listOf(
                "Registration may require an email address, username, password, and verification information. You may not impersonate another person, create misleading or offensive usernames, violate trademarks, or use automated registration tools. FilipinoDama may reject or require changes to usernames that violate these Terms."
            )),
            LegalSection("5", "Account Security", listOf(
                "You are responsible for protecting your login credentials. Use a strong password, safeguard your email account, and notify FilipinoDama immediately if you suspect unauthorized access. FilipinoDama will never ask for your password."
            )),
            LegalSection("6", "Account Ownership", listOf(
                "Accounts are licensed to you and remain part of the Service. Accounts may not be sold, transferred, rented, shared for competitive advantage, or used as collateral. Violations may result in permanent suspension."
            )),
            LegalSection("7", "License to Use the Service", listOf(
                "FilipinoDama grants you a limited, personal, non-exclusive, non-transferable, revocable license to use the Service for personal, non-commercial entertainment. You may not copy, modify, reverse engineer, scrape, distribute, or commercially exploit any part of the Service without written permission."
            )),
            LegalSection("8", "Acceptable Use", listOf(
                "§ 8.1 Personal License",
                "You may use FilipinoDama solely for your personal, non-commercial entertainment. You agree to use the Service in a manner that is lawful, respectful of other players, and consistent with these Terms.",
                "§ 8.2 Prohibited Activities",
                "You must not interfere with the operation of the Service or attempt to gain an unfair advantage. Prohibited conduct includes creating multiple accounts to evade sanctions, impersonating another person, abusing customer support, distributing malware, scraping game data without authorization, or attempting to access systems that are not intended for public use.",
                "§ 8.3 Communications",
                "If chat, guild chat, or messaging features are available, you may not post unlawful, threatening, defamatory, hateful, sexually explicit, discriminatory, or fraudulent content. Spam, unsolicited advertising, phishing attempts, and scams are prohibited.",
                "§ 8.4 Reports",
                "Users are encouraged to report violations in good faith. Knowingly submitting false reports to harass another player may itself be treated as a violation."
            )),
            LegalSection("9", "Fair Play", listOf(
                "§ 9.1 General Principle",
                "Every match must be played fairly. Players are expected to rely on their own skill and judgment. Any attempt to manipulate the outcome of a match or ranking system undermines the integrity of FilipinoDama.",
                "§ 9.2 Match Manipulation",
                "Players must not intentionally lose, collude with opponents, coordinate outcomes, queue simultaneously to influence rankings, or otherwise manipulate matchmaking.",
                "§ 9.3 Smurfing and Boosting",
                "Creating or using additional accounts to artificially influence rankings, boost another player's rating, or bypass matchmaking restrictions may result in sanctions.",
                "§ 9.4 Exploits",
                "If you discover a bug that provides an unfair advantage, you must report it promptly. Deliberately exploiting known bugs before they are fixed may result in match reversals, rating adjustments, suspension, or permanent account termination."
            )),
            LegalSection("10", "Anti-Cheat Policy", listOf(
                "§ 10.1 Prohibited Software",
                "The use of bots, scripts, macros, browser automation tools, modified clients, packet manipulation tools, memory editing software, or similar technologies designed to automate gameplay or gain an unfair advantage is strictly prohibited.",
                "§ 10.2 Investigations",
                "FilipinoDama may review server logs, gameplay records, match histories, connection information, and other technical evidence when investigating suspected cheating. The Company is not required to disclose the methods used to detect or investigate cheating.",
                "§ 10.3 Enforcement",
                "Depending on the severity of the violation, enforcement actions may include warnings, temporary suspensions, permanent bans, removal from leaderboards, reversal of match results, forfeiture of virtual rewards, guild removal, or any combination of these actions."
            )),
            LegalSection("11", "Player Conduct", listOf(
                "§ 11.1 Respect for Others",
                "Players must treat others with respect. Harassment, discrimination, threats, doxxing, stalking, hate speech, and targeted abuse are prohibited.",
                "§ 11.2 Usernames and Guild Names",
                "Usernames and guild names must not be offensive, misleading, infringe intellectual property rights, impersonate public figures, or encourage illegal activity. FilipinoDama may require a name change or remove content that violates this policy.",
                "§ 11.3 Real-Money Trading",
                "Virtual currency and virtual items may not be sold, exchanged for cash, or traded outside the official game systems. Any attempt to engage in real-money trading may result in permanent account action.",
                "§ 11.4 Appeals",
                "Players may contact support to request a review of enforcement actions. Submission of an appeal does not guarantee reversal, and repeated abusive appeals may be declined."
            )),
            LegalSection("12", "Ranked Matches and Leaderboards", listOf(
                "§ 12.1 Ranked Competition",
                "Ranked Matches are intended to measure player skill through FilipinoDama's matchmaking and rating systems. Participation is optional. By entering Ranked Matches, you agree that your rating, rank, win-loss record, and leaderboard position may be publicly displayed.",
                "§ 12.2 Rating Adjustments",
                "FilipinoDama may modify, recalculate, or reset ratings where technical errors, exploits, cheating, collusion, or system changes affect competitive integrity. Rating formulas are proprietary and may change without prior notice.",
                "§ 12.3 Seasons",
                "Competitive play may be divided into seasons. At the end of a season, rankings may be reset in whole or in part, rewards distributed according to eligibility, and inactive accounts archived from seasonal leaderboards.",
                "§ 12.4 Disconnects",
                "If a player disconnects, the server will determine the match outcome according to the applicable game rules and technical conditions. Intentional disconnects to avoid losses may result in penalties.",
                "§ 12.5 Competitive Integrity",
                "The Company reserves the right to remove players from leaderboards, invalidate matches, or withhold seasonal rewards where there is reasonable evidence of manipulation or unfair play."
            )),
            LegalSection("13", "Guild System", listOf(
                "§ 13.1 Guild Creation",
                "Eligible players may create or join guilds subject to gameplay requirements. Guild names, emblems, and descriptions must comply with these Terms.",
                "§ 13.2 Guild Leadership",
                "Guild leaders are responsible for managing membership and permissions. FilipinoDama may transfer or dissolve inactive guilds where necessary to maintain the Service.",
                "§ 13.3 Guild Conduct",
                "Guilds may not be used to organize cheating, harassment, scams, hate groups, or other prohibited activity. Entire guilds may face moderation where coordinated misconduct occurs.",
                "§ 13.4 Guild Content",
                "Guild names, descriptions, announcements, and uploaded content may be moderated or removed if they violate these Terms."
            )),
            LegalSection("14", "Friends and Social Features", listOf(
                "§ 14.1 Friends List",
                "The Service may allow players to add or remove friends. Players are responsible for deciding whom they interact with.",
                "§ 14.2 Blocking",
                "Where available, blocking tools may be used to limit unwanted interactions. Blocking does not guarantee that all future interactions will be prevented.",
                "§ 14.3 Social Safety",
                "Do not share passwords, financial information, government-issued identification numbers, or other sensitive personal information with other players."
            )),
            LegalSection("15", "Virtual Currency and Virtual Store", listOf(
                "§ 15.1 Earning Virtual Currency",
                "Virtual Currency is earned only through gameplay, quests, achievements, seasonal rewards, or official events designated by FilipinoDama. No feature currently permits purchasing Virtual Currency using real money.",
                "§ 15.2 Ownership",
                "Virtual Currency and Virtual Items are licensed for use within the Service. They have no real-world monetary value and do not constitute personal property.",
                "§ 15.3 Restrictions",
                "Virtual Currency and Virtual Items may not be redeemed for cash, exchanged outside the Service, sold for real-world consideration, or transferred except through features expressly provided by FilipinoDama.",
                "§ 15.4 Game Balance",
                "To preserve fair gameplay, FilipinoDama may introduce new items, retire existing items, adjust prices, modify rewards, or rebalance the virtual economy at any time."
            )),
            LegalSection("16", "Intellectual Property", listOf(
                "§ 16.1 Ownership",
                "All rights, title, and interest in FilipinoDama, including the source code, game logic, original artwork, animations, sound effects, music, user interface, databases, logos, trademarks, text, graphics, and other original content are owned by the Company or its licensors. These Terms do not transfer ownership of any intellectual property to you.",
                "§ 16.2 Traditional Game",
                "FilipinoDama does not claim ownership over the traditional rules of Dama. However, the Company's original implementation, software, artwork, visual assets, branding, balancing, game systems, original content, and presentation are protected by applicable intellectual property laws.",
                "§ 16.3 User License",
                "You may not copy, reproduce, distribute, modify, create derivative works from, publicly display, commercially exploit, reverse engineer, or otherwise use any protected content except as expressly permitted by law or with the Company's written consent.",
                "§ 16.4 Streaming",
                "You may stream or upload gameplay videos for non-commercial or monetized creator content provided such content does not falsely imply sponsorship, distribute cheats, or infringe the rights of others. The Company may publish separate creator guidelines."
            )),
            LegalSection("17", "User Content", listOf(
                "§ 17.1 Ownership",
                "You retain ownership of content you create and submit, such as profile biographies or support requests. By submitting User Content, you grant the Company a worldwide, non-exclusive, royalty-free license to host, reproduce, display, adapt, and use that content solely for operating, improving, securing, and promoting the Service.",
                "§ 17.2 Moderation",
                "The Company may remove, restrict, edit, or refuse User Content that violates these Terms or applicable law.",
                "§ 17.3 Responsibility",
                "You represent that you have the rights necessary to submit your User Content and that it does not infringe the rights of any third party."
            )),
            LegalSection("18", "Service Availability", listOf(
                "§ 18.1 Maintenance",
                "The Service may occasionally be unavailable because of maintenance, updates, security incidents, infrastructure failures, or events beyond the Company's reasonable control.",
                "§ 18.2 No Guarantee",
                "The Company does not guarantee uninterrupted availability, error-free operation, or that every game session will complete successfully. Reasonable efforts will be made to maintain reliable service.",
                "§ 18.3 Updates",
                "The Company may modify features, rebalance gameplay, introduce new content, remove obsolete features, or discontinue parts of the Service to improve security, performance, or player experience."
            )),
            LegalSection("19", "Suspension and Termination", listOf(
                "§ 19.1 Suspension",
                "The Company may temporarily suspend an Account while investigating suspected violations, fraud, security incidents, or other conduct that threatens the integrity of the Service.",
                "§ 19.2 Permanent Termination",
                "Accounts may be permanently terminated for serious or repeated violations, including cheating, account sales, real-money trading, harassment, illegal activity, or attempts to compromise the Service.",
                "§ 19.3 Effect",
                "Upon termination, access to the Service, virtual currency, virtual items, rankings, guild privileges, and other account benefits may be revoked without compensation, subject to applicable law."
            )),
            LegalSection("20", "Appeals", listOf(
                "§ 20.1 Request for Review",
                "If your account is suspended or restricted, you may submit one appeal through the official support channel. Include your username, the action being appealed, and any relevant information. Filing an appeal does not automatically suspend enforcement.",
                "§ 20.2 Review Process",
                "The Company will review available evidence including server logs, match history, and technical records. Decisions made after review are final unless the Company elects to reopen the case."
            )),
            LegalSection("21", "Disclaimers", listOf(
                "§ 21.1 As-Is Service",
                "The Service is provided on an 'as is' and 'as available' basis to the fullest extent permitted by law. We do not warrant uninterrupted availability, error-free operation, or compatibility with every device or browser."
            )),
            LegalSection("22", "Limitation of Liability", listOf(
                "§ 22.1 Limitation",
                "To the maximum extent permitted by applicable law, the Company will not be liable for indirect, incidental, consequential, special, or punitive damages arising from your use of the Service, including loss of data, rankings, virtual items, or gameplay progress resulting from outages, maintenance, or security incidents."
            )),
            LegalSection("23", "Indemnification", listOf(
                "§ 23.1 User Responsibility",
                "You agree to indemnify and hold the Company harmless from claims, losses, liabilities, and reasonable expenses arising from your violation of these Terms or misuse of the Service."
            )),
            LegalSection("24", "Governing Law", listOf(
                "§ 24.1 Applicable Law",
                "Unless otherwise required by applicable law, these Terms are governed by the laws of the Republic of the Philippines. Courts with proper jurisdiction in the Philippines shall have jurisdiction over disputes relating to these Terms."
            )),
            LegalSection("25", "Amendments", listOf(
                "§ 25.1 Changes",
                "The Company may update these Terms to reflect new features, legal requirements, or operational changes. Material updates will be announced through the website or other reasonable means. Continued use of the Service after the effective date constitutes acceptance of the revised Terms."
            )),
            LegalSection("26", "Contact", listOf(
                "Questions about this policy? Contact our team at support@filipinodama.com, or write to Dama Royal Games Inc., Manila, Philippines. We respond within 30 days."
            ))
        )
    ),
    "community" to LegalDoc(
        kicker = "Conduct",
        title = "Community Guidelines",
        updated = UPDATED,
        intro = "FilipinoDama exists to provide a fun, competitive, and respectful environment where players can enjoy the traditional game of Dama online. Every player shares responsibility for maintaining a welcoming community. These Community Guidelines apply to all interactions within FilipinoDama, including usernames, profiles, guilds, chat features, support requests, and any future official community spaces.",
        sections = listOf(
            LegalSection("2", "Respect Other Players", listOf(
                "Treat all players with courtesy regardless of skill level, nationality, language, religion, gender, or personal background. Healthy competition is encouraged; personal attacks are not. You may celebrate victories and discuss strategy, but you must not harass, intimidate, threaten, or deliberately target another player with abusive behavior."
            )),
            LegalSection("3", "Harassment and Abuse", listOf(
                "The following behaviors are prohibited:",
                "• Threats of violence or self-harm.",
                "• Hate speech or discriminatory language.",
                "• Bullying, stalking, or repeated unwanted contact.",
                "• Sharing another person's personal information (doxxing).",
                "• Sexual harassment or explicit sexual content.",
                "• Encouraging other players to harass an individual or guild. Violations may result in warnings, chat restrictions, suspensions, or permanent account termination depending on severity."
            )),
            LegalSection("4", "Usernames, Profiles, and Guild Names", listOf(
                "Usernames, profile biographies, guild names, guild descriptions, and future custom content must not contain profanity directed at others, hate symbols, impersonation of public figures or FilipinoDama staff, trademarks used without authorization, misleading information, or illegal content. FilipinoDama may require changes without prior notice."
            )),
            LegalSection("5", "Fair Communication", listOf(
                "Constructive criticism, strategy discussions, and friendly banter are welcome. Spam, flooding, repeated unsolicited advertisements, phishing attempts, scam links, malware distribution, chain messages, and impersonation are prohibited. If chat features are expanded in the future, these standards will continue to apply."
            )),
            LegalSection("6", "Ranked Match Conduct", listOf(
                "Ranked matches are designed to reflect player skill. Enter every ranked game with the intention of competing fairly. Intentionally losing, colluding with opponents, queue manipulation, win trading, boosting, account sharing, or any attempt to manipulate rankings is prohibited. Players should complete matches whenever reasonably possible and avoid intentional disconnections."
            )),
            LegalSection("7", "Guild Conduct", listOf(
                "Guilds should promote teamwork and positive community interaction. Guild leaders are encouraged to moderate their communities responsibly. Guilds may not be used to organize cheating, harassment, hate groups, scams, real-money trading, or coordinated abuse. FilipinoDama may remove guild content or disband guilds involved in serious violations."
            )),
            LegalSection("8", "Reporting Players", listOf(
                "If you believe another player has violated these Guidelines or the Terms of Service, submit a report using official reporting tools when available. Include accurate information whenever possible. Reports should be made in good faith and not as retaliation for losing a match."
            )),
            LegalSection("9", "False Reports", listOf(
                "Knowingly submitting false or malicious reports, fabricating evidence, or repeatedly abusing the reporting system may result in disciplinary action. Abuse of moderation resources harms the community and may itself constitute misconduct."
            )),
            LegalSection("10", "Enforcement", listOf(
                "Depending on the severity, frequency, and impact of a violation, FilipinoDama may issue educational warnings, temporary chat restrictions, temporary suspensions, permanent account bans, removal from leaderboards, guild sanctions, content removal, or other reasonable enforcement measures. Serious violations may bypass progressive discipline."
            )),
            LegalSection("11", "Appeals", listOf(
                "Players may submit an appeal through the official support process. Appeals should include relevant information supporting the request. The Company will review available evidence and may uphold, modify, or reverse enforcement actions at its discretion."
            )),
            LegalSection("12", "Positive Community", listOf(
                "Players are encouraged to welcome new members, report bugs responsibly, assist others in learning the game, participate respectfully in community events, and help create a friendly environment that reflects good sportsmanship."
            ))
        )
    ),
    "anticheat" to LegalDoc(
        kicker = "Fair Play",
        title = "Fair Play & Anti-Cheat Policy",
        updated = UPDATED,
        intro = "This Fair Play & Anti-Cheat Policy explains the standards expected of every FilipinoDama player. It supplements the Terms of Service and Community Guidelines by defining prohibited conduct, how investigations may be performed, and the actions that may be taken to preserve competitive integrity.",
        sections = listOf(
            LegalSection("2", "Core Principle of Fair Play", listOf(
                "Every ranked and casual match should be decided by player skill, strategy, and legitimate gameplay. Any action intended to obtain an unfair advantage over another player or manipulate the outcome of a match is prohibited regardless of whether third-party software is used."
            )),
            LegalSection("3", "Prohibited Conduct", listOf(
                "The following activities are prohibited:",
                "• Bots or automated gameplay.",
                "• Macros or scripts that perform game actions automatically.",
                "• Browser automation tools that interact with the game.",
                "• Modified game clients or altered JavaScript intended to bypass game rules.",
                "• Packet manipulation, request replay, or unauthorized API-style interaction.",
                "• Exploiting software bugs after discovering they provide an unfair advantage.",
                "• Reverse engineering the Service for the purpose of cheating.",
                "• Circumventing account penalties through alternate accounts."
            )),
            LegalSection("4", "Ranked Competition Violations", listOf(
                "The following conduct specifically undermines ranked play and is prohibited:",
                "• Win trading.",
                "• Queue sniping to manipulate matchmaking.",
                "• Rating boosting.",
                "• Smurfing for the purpose of abusing lower-ranked players or manipulating ratings.",
                "• Account sharing.",
                "• Intentionally losing to influence another player's ranking.",
                "• Coordinating results with other players or guilds."
            )),
            LegalSection("5", "Bug Reporting", listOf(
                "Players who discover a gameplay or security issue should report it through official support channels. Good-faith reporting will not result in penalties. Deliberately exploiting a bug after becoming aware that it provides an unfair advantage may result in disciplinary action, including reversal of affected match results."
            )),
            LegalSection("6", "Investigations", listOf(
                "FilipinoDama may investigate suspected cheating using server-side records, match logs, gameplay statistics, connection history, player reports, and other technical information reasonably necessary to evaluate potential violations. Investigations may occur before or after enforcement. To preserve the effectiveness of anti-cheat systems, FilipinoDama is not obligated to disclose detection methods, evidence thresholds, or internal investigative procedures."
            )),
            LegalSection("7", "Server Authority", listOf(
                "For competitive integrity, server-side records take precedence over client-side information whenever a discrepancy exists. Match results, rankings, quest completion, virtual currency awards, and disciplinary actions may be based on server records even if a player's local device displays different information."
            )),
            LegalSection("8", "Detection Methods", listOf(
                "FilipinoDama may identify suspicious behavior through automated systems, statistical analysis, abnormal gameplay patterns, integrity checks, player reports, manual review, and other security techniques. The Company may update these methods without notice. Attempting to discover or circumvent detection systems is itself a violation of this Policy."
            )),
            LegalSection("9", "Enforcement Matrix", listOf(
                "Enforcement depends on the seriousness and frequency of the violation. Possible actions include educational warnings, removal of illegitimate rewards, rating adjustments, match reversals, temporary suspensions, permanent account bans, guild sanctions, leaderboard removal, and restriction from future competitive events. Severe cheating may result in immediate permanent enforcement without prior warning."
            )),
            LegalSection("10", "Appeals", listOf(
                "Players who believe enforcement was issued in error may submit one appeal through the official support process. Appeals should be factual and include relevant information. During review, enforcement generally remains in effect. Repeated abusive or duplicate appeals may be declined."
            )),
            LegalSection("11", "Responsible Security Disclosure", listOf(
                "Security researchers acting in good faith are encouraged to report vulnerabilities privately rather than exploiting or publicly disclosing them before a fix is available. Good-faith reports intended to improve the security of FilipinoDama will be reviewed. This provision does not authorize unauthorized access, data extraction, denial-of-service activity, or other unlawful conduct."
            ))
        )
    ),
    "data" to LegalDoc(
        kicker = "Your Data",
        title = "Data & Account Controls",
        updated = UPDATED,
        intro = "This section summarizes what data the game handles and how to exercise your controls — including account and data deletion, which we make easy to find and use, as required by app-store policy.",
        sections = listOf(
            LegalSection("1", "Data Safety Summary", listOf(
                "Collected and linked to you: display name, player tag, avatar, email (if you use social sign-in), gameplay stats, virtual currency and items, and friend/guild activity.",
                "Collected for functionality and security: device and diagnostic data, and chat messages needed to deliver them and enforce our rules. We do not sell your data, and we do not use your data for third-party advertising without your consent."
            )),
            LegalSection("2", "Delete Your Account", listOf(
                "You can request permanent deletion of your account and associated personal data in-app: open Settings → Account → Delete Account, and confirm. You can also request deletion by emailing support@filipinodama.com from your registered address. We complete verified deletion requests within 30 days, except data we must keep for legal, security, or fraud-prevention reasons."
            )),
            LegalSection("3", "Request or Export Your Data", listOf(
                "You may request a copy of the personal data associated with your account. Contact support@filipinodama.com and we will verify your identity and provide an export in a portable format within the time required by law."
            )),
            LegalSection("4", "Manage Permissions", listOf(
                "You control device permissions (such as notifications) in your operating system settings. Revoking a permission may limit related features. The FilipinoDama app does not require special device access beyond what you explicitly grant to function."
            )),
            LegalSection("5", "Regional Rights", listOf(
                "Under the Philippine Data Privacy Act, and — for visitors from those regions — laws such as the GDPR and CCPA/CPRA, you have rights including access, correction, deletion, portability, and the right to lodge a complaint with a regulator. We honour these rights regardless of where you live."
            ))
        )
    ),
    // "How to Play" / "Help & FAQ" — mockup's `infoBlocks` bottom sheet
    // (handoffv3/FilipinoDama Mobile.dc.html mockup-split lines 4864-4886),
    // reused here as two more LegalScreen tabs since it's the same
    // "tap a Settings row -> full-screen scrollable copy" shape as the other
    // five docs, just without numbered sections. Copy is verbatim from the
    // mockup — the ONLY source that defines this content; no such screen
    // existed anywhere else in the app to source it from.
    "howto" to LegalDoc(
        kicker = "How to Play",
        title = "How to Play",
        updated = UPDATED,
        intro = "Learn Filipino Dama in a minute.",
        sections = listOf(
            LegalSection("", "Goal", listOf(
                "Capture or block all of your opponent's pieces. The last player with a legal move wins."
            )),
            LegalSection("", "Moving", listOf(
                "Pieces move one step diagonally forward on the dark squares. Reach the far row to promote to a King (Dama)."
            )),
            LegalSection("", "Capturing", listOf(
                "Jump diagonally over an adjacent enemy piece into the empty square beyond. Captures are mandatory — if one exists, you must take it."
            )),
            LegalSection("", "Chains & Kings", listOf(
                "Keep jumping if more captures are available. Kings move and capture any distance along a diagonal."
            ))
        )
    ),
    "faq" to LegalDoc(
        kicker = "Help & FAQ",
        title = "Help & FAQ",
        updated = UPDATED,
        intro = "Answers to common questions.",
        sections = listOf(
            LegalSection("", "How do I earn Gold?", listOf(
                "Win matches, complete daily quests, and claim your daily login bonus. Gold buys skins and board themes in the Store."
            )),
            LegalSection("", "What are Diamonds for?", listOf(
                "Diamonds are the premium currency for exclusive skins and bundles. Top up from the Store or the wallet chip."
            )),
            LegalSection("", "How does ranking work?", listOf(
                "Ranked wins award trophies that move you up the tiers. Losses cost a smaller amount — climb by winning consistently."
            )),
            LegalSection("", "Can I play offline?", listOf(
                "Yes — pick Play vs AI from the mode menu to practice at Easy, Normal, or Hard."
            ))
        )
    )
)
