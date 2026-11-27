/* 听力种子素材 —— 首次进入 Listening 页时批量写入 listening_materials 表。
   · 放前端而不是后端：素材是可编辑的内容，就地可读、可改、可删，部署也不用动数据文件。
   · transcript 每行一句（对话带 A:/B: 前缀），Step 4 跟读就是按行拆句。
   · keywords 是本段值得收进生词本的词；商务篇优先取 business 词库里已有的词，
     这样练听力能顺手把正在背的词过一遍，形成「听力 ↔ 词汇」闭环。
   · answer 是 A/B/C/D 之一。题目考细节和推理，不考原文原句硬抄。 */
window.LISTENING_SCENES = [
  { key: 'daily', label: 'Daily English', desc: '日常场景：咖啡店、旅行、餐厅、购物、闲聊', items: [
    { key: 'coffee',    label: 'Coffee shop', icon: '☕' },
    { key: 'travel',    label: 'Travel',      icon: '✈️' },
    { key: 'restaurant',label: 'Restaurant',  icon: '🍽️' },
    { key: 'shopping',  label: 'Shopping',    icon: '🛍️' },
    { key: 'smalltalk', label: 'Small talk',  icon: '💬' },
  ]},
  { key: 'business', label: 'Business English', desc: '商务场景：会议、汇报、谈判、邮件、大会', items: [
    { key: 'meeting',   label: 'Meeting',          icon: '🗓️' },
    { key: 'present',   label: 'Presentation',     icon: '📊' },
    { key: 'update',    label: 'Project Update',   icon: '📈' },
    { key: 'email',     label: 'Email Discussion', icon: '📧' },
    { key: 'negotiate', label: 'Negotiation',      icon: '🤝' },
    { key: 'conference',label: 'Conference',       icon: '🎤' },
  ]},
  { key: 'advanced', label: 'Advanced', desc: '高阶输入：演讲、播客、新闻、访谈', items: [
    { key: 'ted',     label: 'TED-style speech', icon: '🎙️' },
    { key: 'podcast', label: 'Podcast',          icon: '🎧' },
    { key: 'news',    label: 'News',             icon: '📰' },
    { key: 'interview',label:'Interview',        icon: '🎬' },
  ]},
];

window.LISTENING_SEED = [
  /* ---------------- Daily English ---------------- */
  {
    scene: 'coffee', category: 'daily', level: 1, voice: 'en-US-JennyNeural',
    title: 'Ordering at a busy café',
    transcript:
`A: Hi there, what can I get for you?
B: Could I have a large oat milk latte, please? And could you make it extra hot?
A: Sure. Anything to eat? Our almond croissants just came out of the oven.
B: That's tempting, but I'm trying to cut down on sugar this month. Do you have anything savoury?
A: We've got a ham and cheese croissant, or a spinach and feta roll.
B: I'll take the spinach one. Actually, hold on — is that served cold, or do you heat it up?
A: We warm it up unless you ask us not to.
B: Great, warm it then. Oh, and could I get an extra shot in the latte? I've got a long afternoon ahead.
A: No problem. That's six fifty altogether. Card or cash?
B: Card, please.
A: And your name for the order?
B: Emily.
A: Perfect. We'll call you when it's ready — about three minutes.`,
    translation:
`A：你好，需要点什么？
B：麻烦来一杯大杯燕麦拿铁，能做得特别烫一点吗？
A：好的。要配点吃的吗？我们的杏仁可颂刚出炉。
B：很心动，但这个月我在控糖。有没有咸口的？
A：有火腿芝士可颂，还有菠菜羊乳酪卷。
B：我要菠菜的。等等——那个是冷的，还是你们会加热？
A：除非你特意说不要，我们都会加热。
B：好，那就加热。哦对了，拿铁能加一份浓缩吗？我下午还很长。
A：没问题。一共六块五。刷卡还是现金？
B：刷卡。
A：请问订单名字？
B：Emily。
A：好的，好了叫你——大概三分钟。`,
    keywords: 'tempting, savoury, croissant, oat',
    qs: [
      { q: 'Why does the customer turn down the almond croissant?',
        a: 'She is allergic to almonds', b: 'She is cutting down on sugar',
        c: 'It is no longer fresh', d: 'She already had breakfast',
        answer: 'B', explain: 'cut down on sugar = 减少糖分摄入。注意不是 because of allergies。' },
      { q: 'How will the spinach roll be served?',
        a: 'Cold, straight from the fridge', b: 'Heated up',
        c: 'Cut into two halves', d: 'Wrapped to take away',
        answer: 'B', explain: '店员说 "We warm it up unless you ask us not to"，顾客回 "warm it then"。' },
      { q: 'Why does she ask for an extra shot?',
        a: 'The coffee tastes too weak', b: 'She has a long afternoon ahead',
        c: 'She did not sleep well', d: 'She is meeting a friend later',
        answer: 'B', explain: '原文 "I\'ve got a long afternoon ahead"，是需要提神，不是嫌咖啡淡。' },
    ],
  },
  {
    scene: 'travel', category: 'daily', level: 1, voice: 'en-US-GuyNeural',
    title: 'Check-in with an overweight bag',
    transcript:
`A: Good morning. May I see your passport and booking reference?
B: Sure, here you go. I'm on the nine forty to Lisbon.
A: Thank you. Are you checking any bags today?
B: Just this one suitcase. I tried to keep it light, but I'm moving apartments, so...
A: I see. Let's put it on the scale. Hmm, twenty-six kilos. The allowance is twenty-three.
B: Oh no. Is that going to cost a lot?
A: It's forty euros for the excess, or you could take a few things out and carry them on.
B: Honestly, that sounds like a hassle at this hour. I'll just pay it.
A: No problem at all. Would you like a window or an aisle seat?
B: Window, please — if there's one left.
A: You're in luck, there is. Gate B fourteen, boarding starts at nine. Have a good trip.
B: Thanks very much.`,
    translation:
`A：早上好，请出示护照和订票号。
B：给你。我坐九点四十去里斯本的航班。
A：谢谢。今天有行李要托运吗？
B：就这一个箱子。我想尽量少带，但我在搬家，所以……
A：明白了。放秤上吧。嗯，二十六公斤，额度是二十三。
B：糟了，这要花很多钱吧？
A：超重费四十欧，或者你拿出几件随身带着。
B：老实说，这个点折腾挺麻烦的，我直接付钱吧。
A：完全没问题。想要靠窗还是过道？
B：靠窗，如果还有的话。
A：运气不错，还有。B14 登机口，九点开始登机。旅途愉快。
B：非常感谢。`,
    keywords: 'allowance, excess, hassle, aisle',
    qs: [
      { q: 'How much is the suitcase over the allowance?',
        a: 'Three kilos', b: 'Twenty-three kilos', c: 'Six kilos', d: 'Forty kilos',
        answer: 'A', explain: '实际 26 公斤，额度 23 公斤，超了 3 公斤。forty 是超重费（欧元），别混。' },
      { q: 'What does the passenger decide to do about the extra weight?',
        a: 'Remove some items and carry them on', b: 'Pay the excess fee',
        c: 'Ship the bag separately', d: 'Take a later flight',
        answer: 'B', explain: '"that sounds like a hassle... I\'ll just pay it" —— 嫌麻烦所以付钱。' },
      { q: 'What is true about the seat?',
        a: 'Only aisle seats are left', b: 'He gets the window seat he asked for',
        c: 'He is upgraded to business class', d: 'He has to change planes',
        answer: 'B', explain: '"You\'re in luck, there is" 说明靠窗还有位。' },
    ],
  },
  {
    scene: 'restaurant', category: 'daily', level: 1, voice: 'en-US-JennyNeural',
    title: 'Sending a dish back',
    transcript:
`A: Hi, is everything alright with your meal?
B: Actually, no, I'm afraid. The steak is well done, but I asked for medium rare.
A: Oh, I'm so sorry about that. Let me take it back to the kitchen right away.
B: I'd appreciate it. I don't want to make a fuss, but it's quite tough.
A: Of course, and you're not making a fuss at all. Would you like it remade, or something else from the menu?
B: Remade would be lovely, if it's not going to hold up my friends' meals.
A: Not at all — the kitchen can fire it in about eight minutes. I'll bring the others' plates now, and yours straight after.
B: That works. Thank you for handling it so quickly.
A: My pleasure. Can I get you another glass of wine while you wait? On the house.
B: Oh, that's very kind. Yes, please.`,
    translation:
`A：您好，菜品还合口味吗？
B：恐怕不太行。这牛排是全熟的，但我点的是三分熟。
A：非常抱歉，我马上送回厨房。
B：谢谢。我不想小题大做，但它确实很老。
A：当然，您完全没有小题大做。您希望重做一份，还是换菜单上别的？
B：重做就好，只要不会耽误我朋友们的菜。
A：不会——厨房大约八分钟就能出。我先把其他人的上齐，您的随后就来。
B：可以，谢谢你处理得这么快。
A：不客气。等的时候需要再来一杯酒吗？本店请客。
B：太贴心了，好的，麻烦了。`,
    keywords: 'tough, remake, fuss, on the house',
    qs: [
      { q: 'What is the problem with the steak?',
        a: 'It is undercooked', b: 'It is overcooked',
        c: 'It is the wrong dish', d: 'It is cold',
        answer: 'B', explain: '点了 medium rare（三分熟），上来是 well done（全熟）—— 做过了头。' },
      { q: 'What solution does the customer accept?',
        a: 'A different dish from the menu', b: 'Having the steak remade',
        c: 'A full refund', d: 'Eating it as it is',
        answer: 'B', explain: '"Remade would be lovely" —— 同意重做，前提是别拖慢朋友的菜。' },
      { q: 'What does "on the house" mean here?',
        a: 'Served at the bar', b: 'Free of charge',
        c: 'Made by the chef personally', d: 'Delivered to your home',
        answer: 'B', explain: 'on the house = 店家买单、免费。餐厅常用习语。' },
    ],
  },
  {
    scene: 'shopping', category: 'daily', level: 1, voice: 'en-US-GuyNeural',
    title: 'Returning a jacket',
    transcript:
`A: Hi, I'd like to return this jacket if possible.
B: Sure. Do you have the receipt with you?
A: Yes, here. I bought it two weeks ago, but it just doesn't fit right across the shoulders.
B: I can see that. Was it worn, or is it still new with tags?
A: Still tagged, never worn outside. I only tried it on at home.
B: That's perfect, then. Do you want a refund, or would you like to exchange it for a different size?
A: Hmm, does a medium exist in the navy colour?
B: Let me check the stock room for you... Yes, we have one left in navy.
A: Great, let's exchange then. I love the colour, the cut was just too narrow.
B: No problem. There's no price difference, so I'll just swap the tags over. Anything else today?
A: That's it, thanks. You've been really helpful.`,
    translation:
`A：你好，如果可以的话我想退这件夹克。
B：好的，有带小票吗？
A：有，在这儿。两周前买的，但肩部就是不合身。
B：看得出来。穿过吗，还是带吊牌全新？
A：吊牌还在，从没穿出门，只在家试过。
B：那就没问题。您想退款，还是换个尺码？
A：嗯，藏青色有中号吗？
B：我帮您查一下库存……有的，藏青还剩一件。
A：太好了，那就换。我很喜欢这个颜色，只是版型太窄。
B：没问题。价格没差，我把吊牌换一下。今天还要别的吗？
A：就这些，谢谢，你帮了大忙。`,
    keywords: 'receipt, exchange, refund, tag',
    qs: [
      { q: 'Why does the customer want to return the jacket?',
        a: 'It has a defect', b: 'It does not fit properly',
        c: 'The colour is wrong', d: 'It was a gift',
        answer: 'B', explain: '"doesn\'t fit right across the shoulders" —— 肩部不合身，不是质量问题。' },
      { q: 'What condition is the jacket in?',
        a: 'Unworn with tags still on', b: 'Worn once',
        c: 'Damaged at the sleeve', d: 'Washed',
        answer: 'A', explain: '"Still tagged, never worn outside" —— 这也是能顺利退换的前提。' },
      { q: 'What does the customer finally do?',
        a: 'Get a full refund', b: 'Exchange it for a medium in navy',
        c: 'Keep the jacket', d: 'Order online instead',
        answer: 'B', explain: '查到藏青中号还有一件，决定换货而非退款。' },
    ],
  },
  {
    scene: 'smalltalk', category: 'daily', level: 1, voice: 'en-US-JennyNeural',
    title: 'Monday morning by the coffee machine',
    transcript:
`A: Morning! You look like you've had a weekend.
B: Oh, I did. We drove up to the coast on Saturday and came back yesterday evening.
A: Nice. How was the weather?
B: Gorgeous on Saturday, absolutely pouring on Sunday. We ended up stuck in a café for three hours.
A: That's still better than being stuck at home, I suppose. Did you get much walking in?
B: A bit, before the rain set in. Honestly, I needed it — I'd been at my desk until eleven the Friday before.
A: I know the feeling. I basically lived in the office last week.
B: Well, whatever happens this week, at least we're starting it with a tan.
A: Ha, exactly. Anyway, I should let you get on. Big day?
B: Three back-to-back meetings, unfortunately.`,
    translation:
`A：早啊！看你这状态，周末过得挺充实。
B：确实。周六开车去了海边，昨晚才回来。
A：不错。天气怎么样？
B：周六特别好，周日简直暴雨。我们最后在咖啡馆困了三个小时。
A：我觉得那也比困在家里强。走了不少路吧？
B：下大雨前走了一些。说真的我需要走走——前一个周五我在办公桌前待到十一点。
A：我懂那种感觉。上周我基本住在公司了。
B：算了，这周不管怎样，至少我们是带着晒黑的肤色开始的。
A：哈哈，没错。行，不耽误你了。今天很忙？
B：三个会连着开，可惜。`,
    keywords: 'gorgeous, pouring, back-to-back, tan',
    qs: [
      { q: 'What happened on Sunday?',
        a: 'They drove to the coast', b: 'It rained heavily',
        c: 'They went for a long walk', d: 'They visited a museum',
        answer: 'B', explain: '"absolutely pouring on Sunday" —— pouring 指下大雨。周六才是晴天去海边。' },
      { q: 'Why was the walk important to the speaker?',
        a: 'She had been working very late on Friday', b: 'She is training for a race',
        c: 'Her doctor told her to exercise', d: 'She wanted to take photos',
        answer: 'A', explain: '"I\'d been at my desk until eleven the Friday before" —— 前一晚加班很晚。' },
      { q: 'How does the second speaker describe their week ahead?',
        a: 'Quiet and relaxed', b: 'Three back-to-back meetings',
        c: 'Full of business travel', d: 'Mostly working from home',
        answer: 'B', explain: 'back-to-back = 一个接一个、连着。' },
    ],
  },

  /* ---------------- Business English ---------------- */
  {
    scene: 'meeting', category: 'business', level: 2, voice: 'en-US-AndrewNeural',
    title: 'Weekly sync: agenda and action items',
    transcript:
`A: Right, let's get started. We've got forty minutes, so I'll move quickly through the agenda.
B: Before we do, can I add one item? The integration issue with the reporting tool.
A: Good catch. Let's put that right after the numbers. So, first: where are we on the migration?
B: Seventy percent of the regional teams have adopted the new workflow. The remaining three are blocked on training.
A: Blocked how? Is it a scheduling problem or do we have a capability gap?
B: Mostly scheduling. Their leads asked to push it to next quarter, but that would leave us inconsistent for months.
A: I'd rather not accept that. Can we run a condensed session instead of the full programme?
B: That's feasible. I'll evaluate the material and cut it down to ninety minutes.
A: Perfect. Let me capture that as an action item — you, condensed training, by Friday.
B: Understood. And on the integration issue, I'll need a specific list of requirements from the vendor.
A: Ask them for it in writing, and copy me. Anything else? No? Then we're done twelve minutes early.`,
    translation:
`A：好，开始吧。我们有四十分钟，议程我快一点过。
B：开始前我能加一项吗？报表工具的集成问题。
A：提得好，就放在数据后面。首先：迁移进展如何？
B：七成的区域团队已采用新流程，剩下三个卡在培训上。
A：怎么卡的？是排期问题还是能力缺口？
B：主要是排期。他们的负责人想推到下季度，但那样我们会好几个月都不统一。
A：我不太能接受。能不能办一个精简场次，不走完整课程？
B：可行。我评估一下材料，压缩到九十分钟。
A：很好，我记成行动项——你负责精简培训，周五前完成。
B：明白。集成那件事，我需要供应商给一份具体的需求清单。
A：让他们书面提供，并抄送我。还有别的吗？没有？那我们提前十二分钟结束。`,
    keywords: 'adopt, capability, evaluate, requirement, integration, consistent',
    qs: [
      { q: 'What is blocking the remaining three teams?',
        a: 'A technical defect in the new workflow', b: 'Training has not been scheduled yet',
        c: 'They refused to change', d: 'Budget was cut',
        answer: 'B', explain: '"blocked on training" + "mostly scheduling" —— 卡在培训排期，不是技术或预算。' },
      { q: 'Why does the manager reject pushing training to next quarter?',
        a: 'It would leave teams inconsistent for months', b: 'The vendor would charge more',
        c: 'Head office already approved it', d: 'The budget expires this month',
        answer: 'A', explain: '"that would leave us inconsistent for months" —— inconsistent 正是词库里的词。' },
      { q: 'What is the agreed solution?',
        a: 'Cancel the training entirely', b: 'A condensed ninety-minute session',
        c: 'Hire an external trainer', d: 'Move the migration deadline',
        answer: 'B', explain: '"condensed session" / "cut it down to ninety minutes" —— 精简而非取消。' },
    ],
  },
  {
    scene: 'meeting', category: 'business', level: 2, voice: 'en-US-AriaNeural',
    title: 'Pushing back on a deadline',
    transcript:
`A: So the launch date is the fifteenth. I know it's tight, but leadership has already communicated it externally.
B: I hear you, and I want to be constructive here rather than just say no.
A: Go on.
B: If we ship on the fifteenth, we ship without the compliance review. That's not a nice-to-have, it's a requirement in three of our markets.
A: How long does the review actually take?
B: Five working days if nothing comes back. But if they flag an issue, we're looking at a full rewrite of the consent flow.
A: And what happens if we launch and patch it later?
B: We'd be carrying real risk. Once a regulator asks questions, it stops being an internal matter.
A: That's fair. Let me propose something: we hold the external date, but the fifteen becomes a limited release.
B: Limited in what way?
A: Two markets, existing customers only, no press. Full rollout once you sign off.
B: That I can work with. Let me document the scope so nobody expands it later.`,
    translation:
`A：发布日期定在十五号。我知道很紧，但管理层已经对外沟通过了。
B：我理解，但我想建设性地提出意见，而不是简单说不。
A：请讲。
B：如果十五号发布，就没走完合规审查。那不是锦上添花，而是我们三个市场的硬性要求。
A：审查实际要多久？
B：如果没意见，五个工作日。但如果他们提出问题，同意流程可能要整个重写。
A：那先上线、后修补会怎样？
B：风险是实打实的。一旦监管方过问，这就不再是我们内部的事了。
A：有道理。我提议：对外日期保留，但十五号改为限量发布。
B：怎么个限量？
A：两个市场，仅存量客户，不做宣传。你确认没问题后再全面铺开。
B：这个我可以接受。我把范围写下来，免得后面被扩大。`,
    keywords: 'constructive, compliance, requirement, review, flag, scope, rollout',
    qs: [
      { q: 'Why does the second speaker object to the fifteenth?',
        a: 'The product is not finished', b: 'The compliance review would be skipped',
        c: 'The team is on holiday', d: 'The budget is not approved',
        answer: 'B', explain: '合规审查是三个市场的硬性 requirement，不是"锦上添花"。' },
      { q: 'What makes the review time unpredictable?',
        a: 'The vendor is slow', b: 'Issues found may force a full rewrite',
        c: 'It depends on the budget', d: 'Legal team staffing',
        answer: 'B', explain: '"if they flag an issue... full rewrite of the consent flow"。' },
      { q: 'What is the compromise reached?',
        a: 'Delay the launch by a month', b: 'Launch everywhere but without press',
        c: 'A limited release in two markets', d: 'Cancel the launch',
        answer: 'C', explain: '两个市场 + 仅存量客户 + 不做宣传 = 限量发布，日期不变。' },
    ],
  },
  {
    scene: 'present', category: 'business', level: 2, voice: 'en-US-AriaNeural',
    title: 'Opening a product launch presentation',
    transcript:
`A: Thanks everyone for making the time. I'll keep this to fifteen minutes and leave ten for questions.
A: Let me start with the problem, because without it the product doesn't mean much.
A: Our customers tell us the same thing in almost every interview: their data lives in six places, and none of them agree.
A: We heard "I spend Monday mornings reconciling spreadsheets" more times than I can count.
A: So the question we asked ourselves was not how do we build another dashboard.
A: It was: what would it take to give one consistent answer, regardless of who asks?
A: What we built is a single semantic layer. You define a metric once, and every team consumes the same definition.
A: I want to be honest about scope. This does not replace your warehouse. It sits on top of it.
A: And it is not a generic reporting tool. The whole point is that it learns your business logic.
A: In the next three slides I'll show you the architecture, then hand over to Priya for a live demo.`,
    translation:
`A：感谢大家抽空。我用十五分钟讲，留十分钟提问。
A：我先讲问题，因为没有它，产品本身意义不大。
A：几乎每次访谈客户都说同一件事：他们的数据散在六个地方，而且互相不一致。
A："我周一上午都在对表格"这句话我听到的次数数不清。
A：所以我们问自己的问题不是"怎么再造一个仪表盘"。
A：而是：要做到无论谁问都给出一致的答案，需要什么？
A：我们做的是一层统一的语义层。指标定义一次，各团队用的是同一套定义。
A：关于范围我说实话：它不替换你们的数据仓库，而是建在上面。
A：它也不是一个通用报表工具。关键在于它能学习你们的业务逻辑。
A：接下来三页我会讲架构，然后把时间交给 Priya 做现场演示。`,
    keywords: 'consistent, consume, generic, architecture, semantic, dashboard, warehouse',
    qs: [
      { q: 'What core problem does the speaker describe?',
        a: 'Dashboards are too expensive', b: 'Customer data is scattered and inconsistent',
        c: 'The team lacks engineers', d: 'Reports load too slowly',
        answer: 'B', explain: '"data lives in six places, and none of them agree" —— 分散且不一致。' },
      { q: 'What does the product NOT do, according to the speaker?',
        a: 'Work with existing warehouses', b: 'Replace the data warehouse',
        c: 'Learn business logic', d: 'Define metrics once',
        answer: 'B', explain: '"This does not replace your warehouse. It sits on top of it."' },
      { q: 'How is the presentation structured?',
        a: 'Architecture first, then a demo by Priya', b: 'Demo first, then architecture',
        c: 'A customer interview recording', d: 'A pricing discussion',
        answer: 'A', explain: '先三页架构，再交给 Priya 演示。' },
    ],
  },
  {
    scene: 'present', category: 'business', level: 2, voice: 'en-US-AndrewNeural',
    title: 'Handling a tough question after a presentation',
    transcript:
`B: Thanks for the walkthrough. I have a slightly uncomfortable question, if that's alright.
A: Please, go ahead.
B: You showed a forty percent reduction in processing time. Was that measured against your own legacy system or against a competitor?
A: Against our legacy system, and I should have labelled that more clearly on the slide. Fair challenge.
B: I appreciate the honesty. Because when we benchmarked last year, the gap against the market was much smaller.
A: That's consistent with what we saw. The number that matters for you is probably the comparison, not the absolute figure.
B: Right. So, in terms of an apples-to-apples test, could we run a pilot with our own data?
A: Absolutely, and I'd encourage it. We can deploy into a sandbox with your sample set within a week.
B: And who owns the cost of that?
A: We do, up to a point. If it goes beyond two weeks of engineering time, we'd need to talk about it.
B: That's reasonable. Let me take that back to my team and come to you with a decision by Thursday.`,
    translation:
`B：感谢演示。我有个不太客气的问题，可以问吗？
A：请讲。
B：您展示处理时间降低四成。这个对比基准是你们自己的旧系统，还是竞品？
A：是我们的旧系统。这一页我本该标注得更清楚，这个质疑很合理。
B：谢谢您的坦诚。因为我们去年做基准测试时，跟市场的差距要小得多。
A：这和我们的观察一致。对您来说关键的数字可能是对比值，而不是绝对值。
B：对。那么为了公平对比，我们能用自家数据做个试点吗？
A：当然，而且我鼓励这样做。一周内我们可以在沙箱里部署您的样本数据。
B：费用由谁承担？
A：在一定程度上由我们承担。如果超过两周的工程量，就需要再谈。
B：很合理。我带回去跟团队商量，周四前给您答复。`,
    keywords: 'legacy, benchmark, consistent, deploy, pilot, in terms of, absolute',
    qs: [
      { q: 'What was misleading about the forty percent figure?',
        a: 'It was measured against the old system, not competitors',
        b: 'It included only one customer',
        c: 'It was measured over one day',
        d: 'It referred to cost, not time',
        answer: 'A', explain: '对比基准是 legacy system（自家旧系统），不是竞品。' },
      { q: 'How does the presenter respond to the challenge?',
        a: 'He defends the number', b: 'He concedes the slide was unclear',
        c: 'He asks to move on', d: 'He blames the marketing team',
        answer: 'B', explain: '"I should have labelled that more clearly" —— 直接承认。' },
      { q: 'What does the questioner propose?',
        a: 'A pilot using their own data', b: 'Buying the product immediately',
        c: 'A full refund', d: 'A competitor comparison report',
        answer: 'A', explain: '"could we run a pilot with our own data" —— 沙箱试点。' },
    ],
  },
  {
    scene: 'update', category: 'business', level: 2, voice: 'en-US-AndrewNeural',
    title: 'Status update: behind schedule',
    transcript:
`A: Let me give you the honest picture before you read it in the dashboard. We are nine days behind.
B: Nine days. That's more than I expected. What changed since last week?
A: Two things. The data migration took longer than modelled because the source system has years of legacy records we didn't anticipate.
A: And we lost two engineers to another project, which I flagged on Tuesday.
B: I remember the second one. The first one I'm hearing now.
A: Fair. I should have escalated it earlier rather than assuming we'd absorb it.
B: Let's deal with what's in front of us. Is the ninth of next month still realistic?
A: Not without a trade-off. I can hold the date if we drop the automated reconciliation module and ship it in a second release.
B: Who does that affect?
A: Finance mainly. They'd reconcile manually for about six weeks.
B: I can live with that. Give me a written plan by tomorrow showing what moves and what doesn't.`,
    translation:
`A：在你从仪表盘上看到之前，我先说实话：我们落后九天。
B：九天，比我预想的多。跟上周比发生了什么？
A：两件事。数据迁移比模型预估的久，因为源系统里有大量我们没预料到的历史遗留数据。
A：另外我们有两个工程师被抽去别的项目，这点我周二提过。
B：第二件我记得，第一件我现在才听到。
A：说得对。我本该早点上报，而不是想当然地以为我们能消化掉。
B：先处理眼前的事。下个月九号还现实吗？
A：不做什么取舍的话不现实。如果想保住日期，就得砍掉自动对账模块，放到第二版发布。
B：影响谁？
A：主要是财务。他们要手工对账大约六周。
B：这个我能接受。明天给我一份书面计划，写清哪些动、哪些不动。`,
    keywords: 'legacy, anticipate, escalate, trade-off, module, release, realistic',
    qs: [
      { q: 'What is the main reason for the delay?',
        a: 'Unexpected legacy data in the source system', b: 'The team lacks skills',
        c: 'Budget was frozen', d: 'The vendor delivered late',
        answer: 'A', explain: '"years of legacy records we didn\'t anticipate" 拖慢了迁移。' },
      { q: 'What does the manager criticise?',
        a: 'The quality of the work', b: 'Not escalating the migration issue earlier',
        c: 'Hiring too many engineers', d: 'Using the wrong dashboard',
        answer: 'B', explain: '"I\'m hearing now" + 对方承认 "should have escalated it earlier"。' },
      { q: 'What trade-off is proposed to keep the date?',
        a: 'Cut the automated reconciliation from this release', b: 'Add more engineers',
        c: 'Extend the deadline by nine days', d: 'Reduce test coverage',
        answer: 'A', explain: '砍掉自动对账模块，放到第二版，财务先手工对账六周。' },
    ],
  },
  {
    scene: 'update', category: 'business', level: 2, voice: 'en-US-AriaNeural',
    title: 'Escalating a risk before it becomes a problem',
    transcript:
`A: I want to raise something while it is still a risk and not yet an incident.
B: That's a refreshing way to start a status call. Go on.
A: Our staging environment has been failing intermittently for about a week. Roughly one deploy in six.
B: One in six is not nothing. Do we know why?
A: Not conclusively. The pattern suggests a resource limit rather than a code defect, but I don't want to guess in writing.
B: Understood. What's the impact if it gets worse?
A: If it reaches production, we could ship a partially deployed release. That's the scenario I want to prevent.
B: What do you need from me?
A: Two things. Approval to pause non-critical releases until Tuesday, and about forty hours of platform engineering time.
B: The pause is easy. The forty hours is not — platform is fully allocated this sprint.
A: Then I'd rather we pause and wait, than ship into an environment we don't understand.
B: Agreed. Put the pause in place today, and I'll go find you those hours.`,
    translation:
`A：我想趁它还只是风险、尚未变成事故的时候提出来。
B：以这个开头开状态会还挺少见的。请讲。
A：我们的预发布环境大约一周来间歇性失败，大概六次部署里有一次。
B：六分之一可不是小事。知道原因吗？
A：还不能下结论。从规律看更像资源上限，而不是代码缺陷，但我不想书面猜测。
B：明白。如果恶化会怎样？
A：如果波及生产环境，我们可能发布一个只部署了一部分的版本。这是我要避免的情形。
B：你需要我做什么？
A：两件事。批准周二前暂停非关键发布，以及大约四十小时的平台工程工时。
B：暂停没问题，四十小时不好办——平台团队这个迭代已排满。
A：那我宁愿暂停等待，也不愿往一个我们还没弄明白的环境里发布。
B：同意。今天就执行暂停，我去给你找那批工时。`,
    keywords: 'intermittently, conclusively, defect, scenario, allocate, escalate, deploy',
    qs: [
      { q: 'How often is the staging environment failing?',
        a: 'About one in six deploys', b: 'Every deploy',
        c: 'Once a day', d: 'Never, so far',
        answer: 'A', explain: '"roughly one deploy in six" —— 约六分之一。' },
      { q: 'What does the speaker think is the likely cause?',
        a: 'A code defect', b: 'A resource limit',
        c: 'A network outage', d: 'Human error',
        answer: 'B', explain: '"suggests a resource limit rather than a code defect"，但也说明还不确凿。' },
      { q: 'What is granted immediately?',
        a: 'The forty engineering hours', b: 'The pause on non-critical releases',
        c: 'A new staging server', d: 'External consultants',
        answer: 'B', explain: '"The pause is easy. The forty hours is not" —— 先批了暂停。' },
    ],
  },
  {
    scene: 'email', category: 'business', level: 2, voice: 'en-US-AriaNeural',
    title: 'Decoding a difficult client email',
    transcript:
`A: Have you read the client's note from this morning? I've read it four times and I still can't tell if they're happy.
B: Let me guess. Lots of politeness, no actual commitment.
A: Exactly. "We appreciate the thoroughness of the proposal." Nothing about next steps.
B: That's classic. Read the last paragraph — that's where the real message usually hides.
A: "We will revert once internal stakeholders have aligned." So it's a no?
B: Not a no. It's a stall. They're telling us they can't decide yet without naming who is blocking it.
A: Should I chase them?
B: Not with "any update?" — that's easy to ignore. Give them something to react to.
A: Like what?
B: Send a short summary of the two options, with a recommendation and a date. Make the next step a yes or no, not an essay.
A: That's sharper. And if they go quiet anyway?
B: Then you have something concrete to escalate with, because you made the ask specific.`,
    translation:
`A：你看了客户早上那封邮件吗？我读了四遍还是看不出他们满不满意。
B：我猜是：一堆客套，没有实际承诺。
A：就是这样。"我们欣赏方案的周全性"，下一步一个字没提。
B：很典型。看最后一段——真正的信息通常藏在那儿。
A："待内部相关方达成一致后我们再回复。"所以是拒绝？
B：不是拒绝，是拖延。他们在说现在定不了，但没说是谁卡着。
A：我要催他们吗？
B：别用"有进展吗"——这种很容易被忽略。给他们一个能做出反应的东西。
A：比如？
B：发一份简短的两个选项摘要，附上推荐和日期。让下一步是"是或否"，而不是一篇长文。
A：这样更锋利。那要是他们还是不回呢？
B：那你就有具体依据可以上报了，因为你把请求问得很明确。`,
    keywords: 'thoroughness, revert, stakeholder, align, stall, escalate, specific',
    qs: [
      { q: 'What makes the client email hard to interpret?',
        a: 'It is very long', b: 'It is polite but contains no commitment',
        c: 'It is written in another language', d: 'It was sent to the wrong person',
        answer: 'B', explain: '"lots of politeness, no actual commitment" —— 客套但没有承诺。' },
      { q: 'How does the colleague interpret "we will revert once stakeholders have aligned"?',
        a: 'A clear rejection', b: 'A delay tactic',
        c: 'An acceptance', d: 'A request for a meeting',
        answer: 'B', explain: '"not a no. It\'s a stall" —— 拖延策略。' },
      { q: 'What reply strategy is recommended?',
        a: 'Ask gently whether there is any update',
        b: 'Send two options with a recommendation and a date',
        c: 'Forward it to the client\'s boss',
        d: 'Wait another two weeks',
        answer: 'B', explain: '把下一步变成"是或否"的选择题，而不是开放式追问。' },
    ],
  },
  {
    scene: 'email', category: 'business', level: 2, voice: 'en-US-AndrewNeural',
    title: 'Clarifying scope in an email thread',
    transcript:
`A: Before you hit send on that, can I suggest we tighten the scope paragraph?
B: Sure, what's off about it?
A: It says we will "support the rollout". That's the phrase that gets us into trouble six months from now.
B: Because it's vague?
A: Because it's unbounded. Support could mean answering questions, or it could mean staff on site for four weeks.
B: Fair. What would you write instead?
A: Name the deliverables, name the channel, and name the end date. Ninety days of email and chat support, business hours only, ending March thirty-first.
B: That's much clearer, but won't the client push back on the end date?
A: They might, and that's a good conversation to have now rather than in March.
B: Okay. And if they ask for on-site support later?
A: Then it's a change request, with its own price. That's not being difficult, that's just how projects survive.
B: True. Let me rewrite it. I'll also remove "as needed" — I've used that twice already.
A: Good instinct. Every "as needed" is a bill nobody agreed to.`,
    translation:
`A：在你发送之前，我能建议把范围那段收紧一点吗？
B：当然，哪里不对？
A：上面写我们会"支持上线"。就是这句话会在半年后给我们惹麻烦。
B：因为太含糊？
A：因为没有边界。"支持"可以是回答问题，也可以是派人在现场待四周。
B：有道理。你会怎么写？
A：写清交付物、渠道和截止日期。九十天的邮件与在线支持，仅工作日，三月三十一日结束。
B：清楚多了，但客户不会反对这个截止日吗？
A：可能会，而这是个现在谈比三月谈更好的话题。
B：好吧。那如果他们后面要求现场支持呢？
A：那就是变更请求，单独报价。这不是刁难，这是项目能活下去的方式。
B：确实。我重写一下。我还要删掉"按需"——我已经用了两次。
A：直觉不错。每一个"按需"都是一张没人同意过的账单。`,
    keywords: 'scope, vague, unbounded, deliverable, rollout, change request, clarify',
    qs: [
      { q: 'Why does the colleague object to "support the rollout"?',
        a: 'It is grammatically wrong', b: 'It has no clear boundary',
        c: 'It sounds unprofessional', d: 'It was already agreed',
        answer: 'B', explain: '"unbounded" —— 可能是答疑，也可能是驻场四周，边界不清。' },
      { q: 'What three things should the scope paragraph specify?',
        a: 'Price, timeline and team size', b: 'Deliverables, channel and end date',
        c: 'Names, roles and signatures', d: 'Goals, risks and assumptions',
        answer: 'B', explain: '"Name the deliverables, name the channel, and name the end date。"' },
      { q: 'How should later on-site requests be handled?',
        a: 'Included for free', b: 'As a change request with its own price',
        c: 'Rejected automatically', d: 'Escalated to legal',
        answer: 'B', explain: '"Then it\'s a change request, with its own price。"' },
    ],
  },
  {
    scene: 'negotiate', category: 'business', level: 3, voice: 'en-US-AndrewNeural',
    title: 'Negotiating a volume discount',
    transcript:
`A: Let's talk numbers. Your list price is eleven thousand per seat, per year. For three hundred seats, that's simply not a number I can take to my board.
B: What number can you take?
A: Eight thousand five hundred, and I'll commit to a three-year term.
B: A three-year term is attractive. But eight five is below anything we've done at this volume.
A: What have you done at this volume?
B: Nine two, for a two-year deal with a competitor of yours, last quarter.
A: Then nine two for three years is worse for me than nine two for two.
B: Not necessarily. Locking three years gives you price protection, and our roadmap has two increases planned.
A: I understand the argument. Here's my constraint: my budget is approved annually, not for three years.
B: Then let me propose a structure. Year one at eight eight, years two and three capped at three percent growth.
A: Can I get that in writing before I sign anything?
B: Of course. I'll have the redline to you by Friday.`,
    translation:
`A：谈谈价格。你们的标价是每席位每年一万一千。三百个席位，这个数字我没法拿到董事会上。
B：那你能接受多少？
A：八千五，而且我承诺签三年。
B：三年期很有吸引力。但八五折低于我们在这个量级做过的一切。
A：这个量级你们做到过多少？
B：九二，两年前跟你们的竞争对手签的两年期。
A：那同样是九二，三年期对我来说比两年期更差。
B：不一定。锁定三年给你价格保护，而我们的路线图里有两次涨价计划。
A：我理解这个说法。但我的限制是：预算按年审批，不是按三年。
B：那我提个结构。第一年八八，第二三年涨幅封顶在百分之三。
A：签约前我能拿到书面版本吗？
B：当然，周五前我把修订稿给你。`,
    keywords: 'commit, volume, term, cap, constraint, redline, protection',
    qs: [
      { q: 'What is the buyer\'s opening position?',
        a: 'Eight thousand five hundred with a three-year term', b: 'Eleven thousand with no commitment',
        c: 'Nine thousand two hundred for two years', d: 'A one-year trial',
        answer: 'A', explain: '买家开价 8500 并愿意锁三年，用长期换低价。' },
      { q: 'How does the seller justify a higher price?',
        a: 'By offering better support', b: 'By citing a comparable deal at nine two',
        c: 'By threatening to walk away', d: 'By reducing the seat count',
        answer: 'B', explain: '引用了去年同量级竞对的 9200 成交价做锚点。' },
      { q: 'What does the seller finally propose?',
        a: 'A flat rate for three years',
        b: 'Year one at eighty-eight hundred, later years capped at three percent growth',
        c: 'A refund if usage drops', d: 'Monthly billing only',
        answer: 'B', explain: '第一年 8800，第二三年涨幅封顶 3%，兼顾了买家预算按年批的限制。' },
    ],
  },
  {
    scene: 'negotiate', category: 'business', level: 3, voice: 'en-US-AriaNeural',
    title: 'Negotiating payment terms and liability',
    transcript:
`A: Price is essentially agreed. The two open items are payment terms and the liability cap.
B: Let's take terms first. We need net thirty, not net sixty. Cash flow is the whole reason we're having this conversation.
A: And we need net sixty, because our own suppliers are net forty-five. Sixty puts us in a hole every single month.
B: Then change the structure instead of the days. Half on delivery, half on acceptance, thirty days after each.
A: That works better than I expected, honestly. Now, the liability cap.
B: We're proposing twelve months of fees.
A: Our standard is twelve, but for a deployment touching patient data I need more than that.
B: How much more?
A: Twenty-four months, and I'll accept a carve-out for data breach instead of unlimited liability.
B: A carve-out is doable if it is clearly defined. Define breach, define notification, and I'll sign it.
A: Agreed. Let's get legal on the call Thursday and close this.`,
    translation:
`A：价格基本谈定了。剩下两项是付款条件和责任上限。
B：先看付款条件。我们需要三十天账期，不是六十天。现金流正是我们谈这些的原因。
A：而我们需要六十天，因为我们的供应商给我们的是四十五天。六十天等于每个月都让我们垫资。
B：那就改结构而不是改天数。交付付一半，验收付一半，各三十天内。
A：说实话这比我预想的好。接下来是责任上限。
B：我们提议十二个月服务费。
A：我们的标准是十二个月，但涉及患者数据的部署，我需要比这更高。
B：高多少？
A：二十四个月，同时我接受把数据泄露单独列出，而不是要求无限责任。
B：如果定义清楚，单独列出可以接受。定义泄露、定义通知义务，我就签。
A：成交。周四拉法务上会，把这事收尾。`,
    keywords: 'liability, carve-out, breach, terms, net thirty, acceptance, cap',
    qs: [
      { q: 'Why does the buyer insist on shorter payment terms?',
        a: 'Their finance system requires it', b: 'Cash flow',
        c: 'The supplier demanded it', d: 'Legal policy',
        answer: 'B', explain: '"Cash flow is the whole reason we\'re having this conversation。"' },
      { q: 'What payment structure is agreed?',
        a: 'Net sixty from delivery', b: 'Half on delivery, half on acceptance, thirty days each',
        c: 'Full payment upfront', d: 'Monthly instalments over a year',
        answer: 'B', explain: '改结构不改天数：交付一半、验收一半，各 30 天。' },
      { q: 'How is the liability disagreement resolved?',
        a: 'Unlimited liability accepted', b: 'Twenty-four months cap with a defined data breach carve-out',
        c: 'Twelve months with no exceptions', d: 'Left for later',
        answer: 'B', explain: '上限提到 24 个月，同时数据泄露做 carve-out（单独列出），不要求无限责任。' },
    ],
  },
  {
    scene: 'conference', category: 'business', level: 2, voice: 'en-US-AndrewNeural',
    title: 'Networking during a coffee break',
    transcript:
`A: Sorry — is this seat taken?
B: No, please. I'm hiding from the exhibition hall for ten minutes.
A: Ha, same. The hall is relentless once someone scans your badge.
B: Tell me about it. So what brings you here?
A: I run platform engineering at a mid-size insurer. Mostly I came to understand what people are actually deploying versus what the keynotes claim.
B: That's the right reason. Half the talks are strategy, and the interesting question is always what shipped.
A: Exactly. Have you seen anything real this week?
B: One, yes. A logistics company presented a rollout that failed twice publicly. No slides about vision, just what broke.
A: That's brave. And useful.
B: I thought so. I'm going to their workshop this afternoon. Want to come?
A: I'd love to, but I'm presenting at two. Could you send me the summary afterwards?
B: Sure. Let me get your details — I'll scan your badge so I don't misspell it.`,
    translation:
`A：不好意思，这个位置有人吗？
B：没有，请坐。我在展厅躲十分钟。
A：哈哈，一样。一旦有人扫了你的胸牌，展厅就变得没完没了。
B：太有同感了。你为什么来这儿？
A：我在一家中型保险公司负责平台工程。主要是想搞明白大家实际在部署什么，而不是主题演讲宣称什么。
B：这个理由对。一半的演讲都是战略，而真正有意思的问题永远是"到底上了什么"。
A：正是。这周你看到什么实在的东西了吗？
B：有一个。一家物流公司讲了两次公开失败的推广。没有愿景幻灯片，只有哪里出了问题。
A：很有勇气，也有用。
B：我也这么想。我下午去他们的研讨会，一起？
A：很想去，但我两点有演讲。会后你能把要点发我吗？
B：当然。留个联系方式——我扫你胸牌，免得拼错名字。`,
    keywords: 'relentless, deploy, keynote, rollout, workshop, exhibit',
    qs: [
      { q: 'Why is the second speaker sitting there?',
        a: 'Waiting for a talk to start', b: 'Taking a break from the exhibition hall',
        c: 'Charging a laptop', d: 'Looking for a colleague',
        answer: 'B', explain: '"hiding from the exhibition hall for ten minutes"。' },
      { q: 'What does the first speaker really want to learn at the conference?',
        a: 'Future strategy and vision', b: 'What companies have actually deployed',
        c: 'How to get funding', d: 'Recruiting tips',
        answer: 'B', explain: '"what people are actually deploying versus what the keynotes claim"。' },
      { q: 'Why did the logistics talk impress the speaker?',
        a: 'It had the best slides', b: 'It openly discussed failures',
        c: 'It was given by a celebrity', d: 'It announced a new product',
        answer: 'B', explain: '"a rollout that failed twice publicly... just what broke" —— 讲失败而非愿景。' },
    ],
  },
  {
    scene: 'conference', category: 'business', level: 3, voice: 'en-US-AriaNeural',
    title: 'Panel: is agentic AI ready for production?',
    transcript:
`A: I'll start with a blunt question for the panel. How many of you have an agentic system running in production today?
B: We do, in a narrow domain. Ticket routing. Nothing that touches money.
C: That's the honest answer most people give once you press them. Narrow, and not money.
A: Why is the scope always narrow?
B: Because the failure mode is not a wrong answer, it's a confident wrong action. A chatbot that hallucinates is embarrassing. An agent that hallucinates a refund is a financial event.
A: So is the blocker technology or governance?
C: Governance, mostly. We can build the thing. We cannot yet explain to an auditor why it did what it did.
B: I'd add evaluation. We lack a consistent way to measure whether an agent improved month over month.
A: And yet everyone has a roadmap slide saying next year.
C: Everyone has a roadmap slide. That is not the same as everyone having a plan.`,
    translation:
`A：我先给各位嘉宾提个直白的问题：你们中有多少人的智能体系统今天跑在生产环境里？
B：我们有，在一个很窄的领域：工单路由。不涉及钱。
C：一旦追问，大多数人都会给出这个诚实的答案：范围很窄，且不碰钱。
A：为什么范围总是很窄？
B：因为失败模式不是"答错"，而是"自信地做错"。聊天机器人产生幻觉只是尴尬，智能体幻觉出退款就是财务事件。
A：所以阻碍是技术还是治理？
C：主要是治理。东西我们能造，但我们还没法向审计方解释它为什么这么做。
B：我想补充评估。我们缺少一种一致的方法来衡量智能体是否逐月在变好。
A：但每个人的路线图上都有"明年"。
C：每个人都有路线图幻灯片，这跟每个人都有计划不是一回事。`,
    keywords: 'agentic, domain, hallucinate, governance, evaluation, consistent, blocker',
    qs: [
      { q: 'What agentic system does the first panellist have in production?',
        a: 'Automated refunds', b: 'Ticket routing in a narrow domain',
        c: 'Financial forecasting', d: 'Customer-facing chat',
        answer: 'B', explain: '"Ticket routing. Nothing that touches money。"' },
      { q: 'According to the panellist, why is scope kept narrow?',
        a: 'The models are too slow', b: 'A confidently wrong action is far more damaging than a wrong answer',
        c: 'Regulators banned wider use', d: 'It is too expensive to scale',
        answer: 'B', explain: '聊天机器人幻觉只是尴尬，智能体幻觉退款是"财务事件"。' },
      { q: 'What does the panellist identify as the main blocker?',
        a: 'Governance and explainability', b: 'Model quality',
        c: 'Hardware costs', d: 'Lack of data',
        answer: 'A', explain: '"Governance, mostly... cannot yet explain to an auditor why it did what it did。"' },
    ],
  },

  /* ---------------- Advanced ---------------- */
  {
    scene: 'ted', category: 'advanced', level: 3, voice: 'en-US-AriaNeural',
    title: 'Why we remember the middle of a story',
    transcript:
`Let me start with a small experiment, and I'd like you to actually do it rather than just listen.
Think of the last conference you attended. Not the opening keynote, not the final applause — the Tuesday afternoon session that you nearly skipped.
Now try to recall one specific thing from it. A sentence, an image, a number.
Chances are it came to you slowly, and chances are it came with a feeling attached.
That is the part of memory we systematically undervalue. We design talks, products and onboarding flows around beginnings and endings, because those are easy to measure.
We ask: did they finish? Did they click? Did they convert?
But the middle is where the change happens. Nobody is persuaded by a headline and nobody is transformed by a summary slide.
What changes people is the long, unglamorous stretch where an idea stops being new and starts being yours.
Here is my argument in one sentence: if you want something to last, stop optimising the edges and start earning the middle.
I'll show you three ways to do that, and the first one is uncomfortable, because it means cutting material you love.`,
    translation:
`我先做个小实验，而且我希望你真的做，而不只是听。
回想你上次参加的会议。不是开场主题演讲，也不是最后的掌声——是那个周二下午你差点跳过的分会。
现在试着回忆其中一个具体的东西。一句话、一个画面、一个数字。
很可能它来得很慢，而且很可能它带着某种情绪。
这正是我们系统性地低估的那部分记忆。我们围绕开头和结尾设计演讲、产品和新手引导，因为那些容易衡量。
我们问：他们看完了吗？点击了吗？转化了吗？
但改变发生在中间。没有人被标题说服，也没有人因为一张总结幻灯片而改变。
改变人的是那段漫长、不起眼的过程——一个想法在那里不再新鲜，开始变成你自己的。
我的论点一句话：如果你想让某样东西持久，别再优化两端，去赢得中间。
我会讲三种做法，第一种让人不舒服，因为它意味着要砍掉你很喜欢的材料。`,
    keywords: 'recall, unglamorous, optimise, convert, persist, systematically',
    qs: [
      { q: 'What does the speaker ask the audience to recall?',
        a: 'The opening keynote', b: 'A mid-week session they nearly skipped',
        c: 'The closing applause', d: 'The conference venue',
        answer: 'B', explain: '刻意避开开场和结尾，点名"差点跳过的周二下午分会"。' },
      { q: 'Why do we focus on beginnings and endings, according to the speaker?',
        a: 'They are easiest to measure', b: 'Audiences prefer them',
        c: 'They cost less to produce', d: 'Speakers are trained that way',
        answer: 'A', explain: '"because those are easy to measure" —— 因为好量化。' },
      { q: 'What is the speaker\'s core argument?',
        a: 'Make openings shorter', b: 'Earn the middle rather than optimise the edges',
        c: 'Always end with a call to action', d: 'Use more data in slides',
        answer: 'B', explain: '"stop optimising the edges and start earning the middle"。' },
    ],
  },
  {
    scene: 'podcast', category: 'advanced', level: 3, voice: 'en-US-AndrewNeural',
    title: 'The hidden cost of context switching',
    transcript:
`A: Everyone talks about deep work as if it were a personality trait. I've started to think it's more like infrastructure.
B: Say more about that.
A: If your calendar is fragmented, no amount of discipline saves you. You can be the most focused person in the building and still lose the day.
B: Because of the switching cost?
A: Partly. But the bigger cost is what I call the re-entry tax. Every time you come back to a hard problem, you spend the first fifteen minutes rebuilding the mental model you had before the interruption.
B: Fifteen minutes feels conservative, honestly.
A: For anything involving code or writing, I think it's generous. And here's the part nobody measures: that tax is paid twice. Once when you leave, because a part of your attention stays behind, and once when you return.
B: So what's the fix? Blocking out mornings?
A: Blocking helps, but it treats the symptom. The real fix is reducing the number of distinct contexts you're responsible for. Most people don't have a focus problem. They have a scope problem.`,
    translation:
`A：大家谈起深度工作，好像它是一种性格特质。我越来越觉得它更像基础设施。
B：展开说说。
A：如果你的日历是碎的，再强的自律也救不了你。你可以是全楼最专注的人，照样丢掉这一天。
B：因为切换成本？
A：一部分。但更大的成本是我说的"重新入场税"。每次回到一个难题，你都要花前十五分钟重建被打断前的心理模型。
B：说实话，十五分钟都算保守了。
A：涉及写代码或写作的事，我觉得十五分钟都算宽松。还有个没人衡量的点：这个税要交两次。离开时交一次，因为你的注意力有一部分还留在原地；回来时再交一次。
B：那怎么解决？把上午空出来？
A：时间块有用，但治标。真正的解法是减少你负责的不同情境的数量。大多数人不是专注力有问题，是职责范围有问题。`,
    keywords: 'fragmented, discipline, re-entry, conservative, generous, distinct, scope',
    qs: [
      { q: 'What does the guest compare deep work to?',
        a: 'A talent some people have', b: 'Infrastructure',
        c: 'A management technique', d: 'A form of exercise',
        answer: 'B', explain: '"more like infrastructure" —— 强调外部条件而非个人特质。' },
      { q: 'What is the "re-entry tax"?',
        a: 'The cost of commuting to the office',
        b: 'The time spent rebuilding your mental model after an interruption',
        c: 'A fee charged by software vendors',
        d: 'The energy spent in meetings',
        answer: 'B', explain: '回到难题时花十五分钟重建被打断前的心理模型。' },
      { q: 'According to the guest, what is the real solution?',
        a: 'Block out mornings for focused work', b: 'Reduce the number of contexts you are responsible for',
        c: 'Work longer hours', d: 'Use productivity software',
        answer: 'B', explain: '"Most people don\'t have a focus problem. They have a scope problem。"' },
    ],
  },
  {
    scene: 'news', category: 'advanced', level: 3, voice: 'en-GB-RyanNeural',
    title: 'Radio bulletin: urban heat and night-time cooling',
    transcript:
`A: And now to the weather story that has quietly become a public health one.
A: Researchers at the Institute for Urban Climate have published findings showing that city centres are retaining heat well into the night, at levels not recorded thirty years ago.
A: The mechanism is not complicated. Concrete and asphalt absorb sunlight through the day and release it slowly after sunset.
A: What is new is the duration. In the nineteen nineties, surfaces typically returned to ambient temperature by two in the morning. In last summer's data, the average was closer to five, and on eleven nights it never happened at all.
A: The authors are careful about causation. They note that higher night-time temperatures correlate with a measurable rise in ambulance callouts for heat-related illness, particularly among residents over seventy.
A: The report recommends three interventions: reflective roofing, expanded tree canopy, and a review of building codes for new developments.
A: The city council says it will respond within sixty days. Critics say that timeline is too slow for a problem that arrives every summer.`,
    translation:
`A：接下来是这条已悄然演变成公共卫生议题的天气新闻。
A：城市气候研究所发布的研究结果显示，市中心直到深夜仍在蓄热，达到三十年前未有记录的水平。
A：原理并不复杂。混凝土和沥青白天吸收日照，日落后缓慢释放。
A：新情况是持续时间。上世纪九十年代，地表通常在凌晨两点回落到环境温度。去年夏天的数据里，平均值接近五点，还有十一个夜晚根本没有回落。
A：作者对因果关系持谨慎态度。他们指出，夜间气温升高与中暑相关疾病的急救呼叫量上升存在相关性，七十岁以上居民尤其明显。
A：报告建议三项措施：反光屋顶、扩大树冠覆盖，以及审查新开发项目的建筑规范。
A：市议会表示将在六十天内回应。批评者认为，对一个每年夏天都到来的问题，这个时间表太慢了。`,
    keywords: 'retain, asphalt, ambient, causation, correlate, intervention, canopy',
    qs: [
      { q: 'What is the key change compared with thirty years ago?',
        a: 'Cities are hotter during the day', b: 'Surfaces retain heat far longer into the night',
        c: 'Rainfall has decreased', d: 'There are more heatwaves',
        answer: 'B', explain: '核心是"持续时间"：九十年代凌晨两点回落，现在接近五点，有 11 晚根本没回落。' },
      { q: 'How do the researchers treat the link to illness?',
        a: 'They prove it causes illness', b: 'They note a correlation but are careful about causation',
        c: 'They dismiss it', d: 'They blame the council',
        answer: 'B', explain: '"careful about causation... correlate with" —— 只说相关性。' },
      { q: 'What criticism is made of the council?',
        a: 'It rejected the report', b: 'Its sixty-day response is too slow',
        c: 'It spent too much money', d: 'It ignored day-time heat',
        answer: 'B', explain: '"that timeline is too slow for a problem that arrives every summer"。' },
    ],
  },
  {
    scene: 'interview', category: 'advanced', level: 3, voice: 'en-US-JennyNeural',
    title: 'Interview: what hiring managers actually read',
    transcript:
`A: You've reviewed, what, four thousand CVs?
B: Something like that. And I want to say something that might sound discouraging: I spend about ninety seconds on the first pass.
A: Ninety seconds. So what survives that?
B: Three things, in order. What you've actually built, what changed because of it, and whether the timeline makes sense.
A: And the education section?
B: Honestly? Almost never in the first pass. It matters at the margin, when two candidates are otherwise identical.
A: What's the most common mistake?
B: Writing responsibilities instead of outcomes. "Responsible for the reporting platform" tells me you were in the room. "Cut reporting time from two days to four hours" tells me the room was better because you were in it.
A: Is there a place for soft skills?
B: Yes, but not as adjectives. Don't tell me you're a collaborative leader. Tell me about the disagreement you resolved and who was unhappy about it.
A: Last question. Does a gap in the CV still count against someone?
B: Less than it used to. What counts against you is vagueness about it. One honest sentence beats a year of silence.`,
    translation:
`A：你大概看过多少份简历？四千？
B：差不多。我想说个可能让人泄气的事实：第一轮我大约花九十秒。
A：九十秒。那什么能留下来？
B：按顺序三件事：你实际做成过什么、因此发生了什么改变、时间线是否合理。
A：教育背景呢？
B：说实话？第一轮几乎不看。只有在两位候选人其他方面完全相同时才起作用。
A：最常见的错误是什么？
B：写职责而不是成果。"负责报表平台"只告诉我你在场；"把出报表时间从两天缩短到四小时"告诉我因为有你在场，事情变好了。
A：软技能有位置吗？
B：有，但别用形容词。别告诉我你是个善于协作的领导者，跟我说说你解决过的那次分歧，以及谁对此不满。
A：最后一个问题。简历空档期现在还减分吗？
B：比以前少了。真正减分的是对空档含糊其辞。一句诚实的话胜过一年的沉默。`,
    keywords: 'margin, outcome, collaborative, adjective, vagueness, identical, resolve',
    qs: [
      { q: 'How much time does the interviewer spend on a first read?',
        a: 'About ninety seconds', b: 'About five minutes',
        c: 'Half an hour', d: 'It depends on the university',
        answer: 'A', explain: '明确说 "about ninety seconds on the first pass"。' },
      { q: 'What does the interviewer say about the education section?',
        a: 'It is the most important part', b: 'It is rarely read in the first pass',
        c: 'It is read first', d: 'It is ignored completely',
        answer: 'B', explain: '"almost never in the first pass"，只在两人难分高下时起作用。' },
      { q: 'How should soft skills be presented?',
        a: 'As a list of adjectives', b: 'Through a specific story of a resolved disagreement',
        c: 'In the education section', d: 'Not at all',
        answer: 'B', explain: '"not as adjectives" —— 用具体事例而非形容词。' },
    ],
  },
];
