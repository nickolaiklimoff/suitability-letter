# Suitability Letter Generator
**Orion Ridge Capital — Internal Tool**

Generates investment suitability letters based on client profiles and transaction data.

## How to use

### Option A — Open directly in browser
1. Download or clone this repository
2. Open `index.html` in Chrome or Safari — no server needed

### Option B — GitHub Pages (shared link)
Enable GitHub Pages in repo Settings → Pages → Source: main branch → Save.
Your link: `https://nickolaiklimoff.github.io/suitability-letter/`

## Workflow

**First time for a new client:**
1. Click `+ New client` in the sidebar
2. Fill in the **Client Profile** tab — saved locally in your browser
3. Go to **New Letter** tab for each transaction

**For each new letter:**
1. Meeting details
2. Recommendation rationale + investment table
3. Documents sent
4. Existing & new portfolio → WAAR calculated automatically
5. Model portfolio allocation
6. Special conditions (deviation, WAAR breach, TAA, concentration)
7. Periodic review options
8. Click **Generate letter** → copy or print to PDF

## Letter structure (mirrors sample letter exactly)
- Intro (date, meet/speak)
- Risk tolerance
- Primary investment objective
- Financial goal
- Time horizon
- Knowledge & experience
- Ability to bear losses
- Recommendation rationale + investment table
- Risks (Alternative Mutual Funds, Concentration, Leveraged, Margin Call)
- Documents confirmation
- Model portfolio table
- Deviation from model (optional)
- WAAR before/after (auto-calculated)
- WAAR breach text (optional)
- TAA text (optional)
- Taxation
- General investment risk
- Periodic assessment of suitability
- Signature: Nikolai Klimov, Partner and Investment Advisor, Orion Ridge Capital

## WAAR methodology
Risk rating scale 1–6 per Orion Ridge Capital Investment Risk Rating Policy.
WAAR = Σ(RiskRating × Amount) / TotalPortfolio

| IR | WAAR range |
|----|-----------|
| IR1 | 1.00–1.99 |
| IR2 | 2.00–2.99 |
| IR3 | 3.00–3.99 |
| IR4 | 4.00–4.99 |
| IR5 | 5.00–5.99 |
| IR6 | 6.00–6.50 |

## Data storage
All client data is stored in your browser's localStorage — nothing is sent to any server.
