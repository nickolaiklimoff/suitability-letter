// ─── Profile options ────────────────────────────────────────────────────────

const RISK_TOLERANCE = [
  { value: 'IR1-0', ir: 'IR1', label: 'Option 0 — IR1', desc: 'Any loss in the value of your portfolio over a rolling one year period would have material detrimental effect on your financial position.' },
  { value: 'IR1-1', ir: 'IR1', label: 'Option 1 — IR1', desc: 'Minimal loss over a rolling one year period would not have a material detrimental effect on your financial position.' },
  { value: 'IR2',   ir: 'IR2', label: 'Option 2 — IR2', desc: 'Small portfolio losses of your portfolio over a rolling one year period would not have a material detrimental effect on your financial position.' },
  { value: 'IR3',   ir: 'IR3', label: 'Option 3 — IR3', desc: 'Moderate portfolio losses of your portfolio over a rolling one year period would not have a material detrimental effect on your financial position.' },
  { value: 'IR4',   ir: 'IR4', label: 'Option 4 — IR4', desc: 'Significant portfolio losses of your portfolio over a rolling one year period would not have a material detrimental effect on your financial position.' },
  { value: 'IR5',   ir: 'IR5', label: 'Option 5 — IR5', desc: 'Large portfolio losses up to the value of your entire portfolio over a one year period would not have a material detrimental effect on your financial position.' },
  { value: 'IR6',   ir: 'IR6', label: 'Option 6 — IR6', desc: 'The loss of your entire portfolio over a one year period combined with the possible requirement to provide additional capital to make up for portfolio losses would not have a material detrimental effect on your financial position.' }
];

const INVESTMENT_OBJECTIVES = [
  { value: 'IR1-cap-pres', ir: 'IR1', label: 'Option 1 — IR1 Capital Preservation', desc: 'A preference for maintaining the safety of invested capital with potential returns that align with short-term money market rates.' },
  { value: 'IR2-defensive', ir: 'IR2', label: 'Option 2 — IR2 Defensive', desc: 'A focus on preserving capital while earning regular income that marginally surpasses short-term money market rates.' },
  { value: 'IR2-income', ir: 'IR2', label: 'Option 3 — IR2 Income Oriented', desc: 'A preference for investments designed to generate income over capital appreciation.' },
  { value: 'IR3-income-growth', ir: 'IR3', label: 'Option 4 — IR3 Income & Growth', desc: 'A preference for investments or strategies that seek to balance income generation with capital appreciation.' },
  { value: 'IR4-growth', ir: 'IR4', label: 'Option 5 — IR4 Growth Oriented', desc: 'A preference for investments or strategies that primarily focus on capital appreciation and less on generating income returns.' },
  { value: 'IR5-high-growth', ir: 'IR5', label: 'Option 6 — IR5 High Growth', desc: 'A preference for investments or strategies with the main focus on pursuing aggressive capital appreciation over time.' },
  { value: 'IR6-speculation', ir: 'IR6', label: 'Option 7 — IR6 Market Speculation', desc: 'A tendency towards investments or trading approaches focused solely on achieving significant capital growth by capitalizing on short-term pricing irregularities among different financial assets.' }
];

const FINANCIAL_GOALS = [
  { value: 'wealth-growth', label: 'Option 1 — Wealth growth' },
  { value: 'capital-preservation', label: 'Option 2 — Capital Preservation' },
  { value: 'property-purchase', label: 'Option 3 — Property purchase' },
  { value: 'business-purchase', label: 'Option 4 — Business purchase' },
  { value: 'retirement', label: 'Option 5 — Retirement / inheritance planning' },
  { value: 'other', label: 'Option 6 — Other (please specify)' }
];

const TIME_HORIZONS = [
  { value: 'lt1', label: 'Option 1 — Less than 1 year' },
  { value: 'lt3', label: 'Option 2 — Up to 3 years' },
  { value: 'lt5', label: 'Option 3 — Up to 5 years' },
  { value: 'lt10', label: 'Option 4 — Up to 10 years' },
  { value: 'gt10', label: 'Option 5 — Over 10 years' }
];

const KNOWLEDGE_PRODUCTS = [
  'Mutual funds',
  'Alternative mutual funds',
  'Exchange traded funds',
  'Complex Exchange Traded Funds',
  'Individual Stocks',
  'Fixed Income',
  'Complex Fixed Income',
  'Derivatives',
  'Structured Notes',
  'Hedge funds',
  'Private Equity Funds',
  'Margin Lending',
  'Leverage Lending'
];

const ABILITY_TO_BEAR_LOSSES = [
  { value: 'risk-averse', label: 'Option 1 — Risk Averse', desc: 'You are averse to investment risks and prefer to safeguard your capital by holding cash and time deposits. You acknowledge that this strategy may yield low returns, often barely keeping pace with inflation.' },
  { value: 'conservative', label: 'Option 2 — Conservative', desc: 'You are aiming to limit portfolio losses within a rolling one-year period and typically prefer investments that are frequently priced and can be quickly sold (within a week) with a high certainty. However, you may occasionally invest in assets with higher risk profiles.' },
  { value: 'mod-conservative', label: 'Option 3 — Moderately Conservative', desc: 'You are aiming to limit moderate portfolio losses within a rolling one-year period while striving for improved long-term performance and typically prefer investments that are frequently priced and can be quickly sold (within a week) in stable markets. However, you may occasionally purchase individual investments with higher risk and lower liquidity.' },
  { value: 'moderate', label: 'Option 4 — Moderate', desc: 'You are willing to tolerate increased portfolio losses over a rolling one-year period, understanding that actual performance may deviate from stated figures, as they strive to improve long-term performance. You are open to purchasing investments or entering contracts that may be challenging to sell or close quickly, with uncertain realizable values at any given time.' },
  { value: 'mod-adventurous', label: 'Option 5 — Moderately Adventurous', desc: 'You are ready to endure significant portfolio losses, potentially equal to the entire portfolio value over a one-year period. You typically engage in purchasing investments or entering contracts that may pose challenges for selling or closing over an extended period, with uncertain realizable values at any given time.' },
  { value: 'adventurous', label: 'Option 6 — Adventurous (Significant Risk)', desc: 'You are willing to put your entire portfolio at significant risk over a one-year period, possibly needing to inject additional capital to cover losses beyond the initial investment. You typically engage in purchasing investments or entering contracts that may prove challenging to sell or close over an extended period, with uncertain realizable values at any given time.' }
];

// ─── IR limits (WAAR corridors) ─────────────────────────────────────────────

const IR_LIMITS = {
  IR1: { min: 1.0, max: 1.99 },
  IR2: { min: 2.0, max: 2.99 },
  IR3: { min: 3.0, max: 3.99 },
  IR4: { min: 4.0, max: 4.99 },
  IR5: { min: 5.0, max: 5.99 },
  IR6: { min: 6.0, max: 6.5  }
};

// ─── Fixed text blocks ───────────────────────────────────────────────────────

const TEXT = {
  intro: `Thank you for taking the time to share your financial planning objectives. It was a pleasure to {MEETSPEAK} with you on {DATE}.

This recommendation is based on information you provided to us during the profiling process and our subsequent discussions in respect of your liquid and liability holdings.

When evaluating your investment time horizon, we advise you to consider maintaining financial emergency reserves as well as funds for any planned expenses.

Please note that the personal recommendation I provide is based on restricted advice, not independent advice. This means my recommendations will be limited to specific products or products from one issuer or a select few issuers, rather than covering every equivalent product within a category.

During our profiling process, we discussed the concept of risk and reward and assessed your risk tolerance through various questions and considerations. You confirmed your risk tolerance, financial situation, ability to handle losses, and access to liquid funds for unforeseen expenses. We also reviewed your time horizon, knowledge, and experience with investments. We discussed the asset classes and asset allocation strategies, the benefits of diversification, and the risks involved in investments. Additionally, we clarified your primary investment objectives and financial goals. Below is a summary of your risk profile, primary investment objectives, financial goals, knowledge and experience with investment products, and investment horizon based on our profiling process.`,

  recommendationIntro: `We have discussed your financial goals and primary investment objectives during our recent discussion and performed initial risk assessment for the recommended investment products. You expressed wish to invest in the below investment products, and I have recommended these instruments to you for the following reasons`,

  feeNote: `In addition, you could be charged a transaction fee, ongoing charges*, global custody fee in accordance to fee schedule of the financial institution where the assets held.\n\n*charges by the fund house and are built into the unit value of the fund`,

  altMutualFundsRisk: `Alternative mutual funds may employ investment strategies that differ from those of traditional mutual funds, potentially exposing them to additional risks. These risks include: leverage risk, counterparty risk, nonlinear market risk, liquidity risk, investment model risk, high portfolio turnover risk, manager risk.`,

  concentrationOk: `We checked the Issuer, Product and Product Category concentration in your investment portfolio based on the financial information provided by you to us and we confirm that they do not exceed our concentration triggers.`,

  concentrationBreach: `Initially we provided investment recommendation where the concentration levels of your portfolio based on the financial information provided by you to us were not exceeded. However, as a result of the changes you requested the concentration was reassessed and your portfolio is now over concentrated and therefore non consistent with your profile. Concentration is an important element to consider. A concentrated position may be defined as the significant presence of a single security, securities of a single issuer or certain class of a security in portfolio. Concentrated position may entail greater risks that a diversified approach to securities.`,

  leveragedRisk: `When you use borrowed funds to finance part of your investment, be aware that leverage substantially amplifies risk. Even minor fluctuations in the market can have a disproportionately large effect on your investment due to the higher amount you've borrowed. This leverage can work in your favour but also against you. If the value of the investment declines, the proceeds from selling it might not be enough to cover the remaining loan balance, potentially requiring you to provide additional funds to settle the outstanding loan amount.`,

  marginCallRisk: `Several factors, such as market volatility, returns, and timing, can influence the price or value of your investment at any given moment. If margin requirements arise, you might need to make additional margin deposits on short notice. If you're unable to do so, your investment positions could be liquidated, potentially resulting in significant losses.`,

  modelPortfolioIntro: `The Recommended Model Portfolio for your investment rating is outlined in the table below. As discussed, while I have advised on the appropriate Model Portfolio asset allocation for your situation, I have not provided a recommendation regarding the currency of your investment.`,

  waarExplanation: `The suitability of a proposed transaction is evaluated using a WAAR (Weighted Average Asset Rating) approach. This method involves assessing how an individual transaction impacts the overall risk profile of your investment portfolio. The goal is to ensure that the transaction aligns with your Investor Rating by examining its effect on the portfolio's risk level, particularly in terms of potential capital loss.

If, before the transaction, the risk level of your portfolio exceeds the maximum risk level appropriate for your Investor Rating, but the transaction results in a reduction of the portfolio's risk level, the transaction will be deemed suitable.`,

  waarBreachText: `I explained that, although the risk level of your portfolio initially exceeded the maximum risk level suitable for your Investor Rating, the selected transactions were deemed appropriate. This is because the individual risk ratings of the relevant products were equal to or lower than your Investor Rating, and for the reasons outlined above. While these transactions will contribute to lowering the overall risk level of your portfolio, additional adjustments will be necessary in the future to realign your portfolio with the risk level that matches your circumstances.`,

  taaText: `You confirmed that you wished to proceed with this investment purchase despite recommendation provided. You agreed to move forward with the purchase, but the product may not align with your suitability criteria. This could expose you to risks that exceed your risk tolerance or financial profile, and it may not align with your investment objectives. You also confirmed that we have only assessed whether you possess the necessary knowledge and experience to understand and accept the risks involved in the product or service.`,

  taxation: `Please note that we do not provide tax advice. If you need assistance in this area, we recommend consulting with your tax advisor.`,

  generalRisk: `Please be aware that this investment is:
• Not insured by any government agency.
• Not a bank deposit.
• Subject to investment risks, including the potential loss of the principal amount invested.
• Past performance is not indicative of future results.
• Investments can fluctuate in value, going up as well as down.
• Currency Risk: Investments denominated in a foreign currency may be subject to exchange rate fluctuations, which could result in a loss of principal when converted back to your home currency.
• Liquidity Risk: It is advisable to maintain an emergency fund to cover unexpected expenses, as you might not be able to liquidate your investments at your desired return due to unforeseen market events.`,

  periodicAssessmentIntro: `Investment performance can vary over time, so regular reviews are important to address any changes in your investments. If you need a review and advice in the future, please contact me to arrange it.`,

  reviewReasons: {
    maturity: `Would Not Require Review as Investment is Held to Maturity: You are investing in a hold-to-maturity instrument. Although the market price may fluctuate during the investment term, premature rebalancing may not be in your best interest, as the investment is intended to be held until maturity.`,
    nonadv: `Would Require Review if Client Performs Non-Advised Transaction or Transfers in an Investment: This recommendation is based on a model portfolio asset allocation. Any future non-advised transactions or the transfer in of additional investments could alter the target asset allocation and may necessitate a review of your investment portfolio.`,
    leverage: `Would Require Review if Client Buying Investment with Leverage: Investments with leverage significantly increase risk. Given the potential for market price fluctuations, you may wish to review your investments periodically to assess the impact of market movements and changes in interest rates, which could affect the cost of your investment.`,
    ir56: `Would Require Review if Client Investing in IR5/IR6 Products: Higher-risk investments, such as those classified as IR5/IR6, may be challenging to sell or close for extended periods and may have uncertain realizable values. Regular reviews are advisable to address any potential movements or issues with these investments in a timely manner.`
  },

  closing: `We understand your circumstances may change over time, it is important to review the suitability of your investment periodically. Please contact me as soon as any significant changes occur to ensure that your investment continues to align with your financial goals. You are welcome to reach out at any time if you have questions or wish to discuss your investments further.`,

  signature: `Yours sincerely,\n\nNikolai Klimov\nPartner and Investment Advisor\nOrion Ridge Capital`
};
