// src/teacher/commentBank.js
// Seed data + helpers for the comment bank system.

export const CATEGORY_ORDER = [
  'General',
  'Strength',
  'Weakness',
  'As per previous conversations',
];

// Placeholders: [first name] and [subject]
export const DEFAULT_BANK = [
  {
    label: 'Perfectly Average', category: 'General', order: 0,
    text: '[first name] has demonstrated consistent performance in Social Studies this semester. They have a solid understanding of the key concepts and participate appropriately in class activities. While they meet expectations, they could benefit from more active engagement and exploring topics that interest them more deeply. Setting personal learning goals and seeking feedback on assignments could help them elevate their understanding and performance further.',
  },
  {
    label: 'Passion for content', category: 'Strength', order: 0,
    text: '[first name] has shown an exceptional passion for the study of [subject] this semester. Their enthusiasm is evident through their extensive research and insightful contributions to class discussions. To further cultivate this interest, they could explore additional resources such as documentaries and historical texts. This continued engagement will not only deepen their knowledge but also inspire their peers.',
  },
  {
    label: 'Participated in discussion', category: 'Strength', order: 1,
    text: '[first name] has been an active participant in our discussions on global issues, consistently bringing thoughtful insights and questions to the table. This engagement has greatly enriched class dialogue.',
  },
  {
    label: 'Written Work', category: 'Strength', order: 2,
    text: "[first name]'s written assignments have consistently demonstrated a deep understanding of Social Studies topics and a clear, analytical writing style. To enhance their skills further, focusing on incorporating a wider variety of sources could provide additional depth to their arguments.",
  },
  {
    label: 'Collaboration', category: 'Strength', order: 3,
    text: "[first name] has excelled in collaborative projects, often taking the lead in organizing and delegating tasks effectively. Their ability to work harmoniously with peers has contributed significantly to their group's success. To continue developing these skills, I recommend that they take on leadership roles in future group activities, which will prepare them for collaborative work in higher education and beyond.",
  },
  {
    label: 'Speaking skills', category: 'Strength', order: 4,
    text: '[first name] has displayed impressive speaking skills, particularly during presentations on [subject]. Their confidence and clarity in conveying information have captivated their audience.',
  },
  {
    label: 'Asking for assistance', category: 'Strength', order: 5,
    text: '[first name] has demonstrated a mature approach to learning by actively seeking assistance whenever needed. This proactive behavior has helped them clarify concepts and enhance their understanding, particularly during our units on [subject]. To continue progressing, they should maintain this openness in communication and consider pairing up with a classmate for regular review sessions. This strategy could further solidify their grasp of complex topics and prepare them for more advanced studies.',
  },
  {
    label: 'Use feedback given', category: 'Weakness', order: 0,
    text: '[first name] has shown potential in their written work, though there is room for improvement in incorporating feedback. I recommend that they review comments on their essays more thoroughly and apply the suggested changes consistently in future assignments. This practice will enhance the clarity and depth of their writing, leading to a stronger analytical approach in Social Studies.',
  },
  {
    label: 'Use graphic organizers', category: 'Weakness', order: 1,
    text: "[first name]'s ideas are insightful but they sometimes struggle with organizing their thoughts coherently in writing. Using graphic organizers can help structure their essays more effectively, ensuring that their arguments flow logically and are supported by evidence. I suggest they begin by outlining their main points using a graphic organizer before starting their draft.",
  },
  {
    label: 'Source Analysis', category: 'Weakness', order: 2,
    text: "[first name] has faced challenges in analyzing sources critically, often accepting information at face value without questioning its validity or bias. To improve in this area, they should practice identifying the purpose and perspective of each source they use. I recommend they use a checklist of critical questions to assess each source's reliability and relevance to their topic.",
  },
  {
    label: 'Use re-assessment opportunities', category: 'Weakness', order: 3,
    text: '[first name] has occasionally missed opportunities to improve their understanding and grades through reassessment. Taking advantage of these opportunities can significantly enhance their learning and performance. I encourage them to actively participate in available reassessment options, particularly in areas they find challenging. This proactive approach will not only improve their grades but also deepen their comprehension of complex concepts.',
  },
  {
    label: 'Attendance', category: 'As per previous conversations', order: 0,
    text: '[first name] has experienced some challenges with regular attendance this semester, as per previous communication. Consistent attendance is crucial for keeping up with the curriculum and participating in group discussions and activities. I encourage [first name] to address any obstacles that may be affecting their ability to attend regularly, and I am available to help find supportive solutions. Improved attendance will significantly enhance their learning experience and performance.',
  },
  {
    label: 'Assignment completion', category: 'As per previous conversations', order: 1,
    text: 'As per previous communication, [first name] has had difficulties with timely assignment completion, which has impacted their ability to fully demonstrate their understanding of the material. To improve in this area, I recommend that [first name] create a structured schedule and set early deadlines for themselves to ensure assignments are completed on time. Utilizing school resources, such as learning support, can also provide the support needed to stay on track.',
  },
  {
    label: 'Distractions in class', category: 'As per previous conversations', order: 2,
    text: 'As per previous communication, [first name] has occasionally allowed their cell phone to become a distraction during class. This has impacted both their focus and their participation in discussions and activities. To enhance their learning environment and academic performance, I recommend that [first name] limit their cell phone use during class hours. We could explore strategies such as turning off the phone or keeping it in a designated area during lessons. Committing to these changes will help [first name] maximize their engagement and success in Social Studies.',
  },
];

export function applyTemplate(text, firstName, lens) {
  return text
    .replace(/\[first name\]/gi, firstName)
    .replace(/\[subject\]/gi, lens);
}
