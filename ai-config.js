// ai-config.js - Natural AI Chat System with Darija Support

class AIConfig {
    constructor() {
        this.conversationHistory = new Map();
        this.userLanguage = new Map();
        
        // Natural Darija responses (Moroccan Arabic - like a real person)
        this.darijaResponses = {
            greetings: [
                "wa 3lykom slm, labas?",
                "3lykom slm, kidayr nta?",
                "wa 3lykom slm, hna tayrin!",
                "3lykom slm, chno khabar?",
                "wa 3lykom slm, sh7al had lghibat!",
                "3lykom slm, labas 3lik?",
                "wa 3lykom slm, tkhlef?",
                "3lykom slm, ahla bik fhad lblad!"
            ],
            howAreYou: [
                "labas lhamdullah, nta kidayr?",
                "mzyan, chokran! w nta?",
                "kulchi mzyan, nta labas?",
                "lhamdullah, baghi n3awnek f 7aja?",
                "mzyan bzzaf, chno khassek?",
                "labas, chno baghi t'aref?",
                "lhamdullah, 3lach sawwalt?"
            ],
            thanks: [
                "l3afou, hna f lkhidma dialek",
                "chokran bzzaf, nta lmezyan",
                "hna had lwqtek, t3ayt lya f ay waqt",
                "l3afou, nta tb9a f lkhir",
                "chokran, 3la lmghribiya f rassek",
                "l3afou, bla mzahra",
                "hna lkhidma, ta7yatna lik"
            ],
            askQuestion: [
                "ah, su'al mzyan! chno baghi t'aref bdabt?",
                "sara7a, su'al zwina. nta baghi t'aref 3la 7aja mo3ayena?",
                "had su'al mhm. nshre7 lik b tafsir?",
                "ah, fhemtek. baghi t'aref chno had lhaja?",
                "su'al mezyan, safi nchre7 lik.",
                "wakha, had su'al sahla, nta baghi t'aref...",
                "fhemt 3lik, ila baghi nta nshre7 lik b sa7bi."
            ],
            compliment: [
                "ah chokran, nta lmezyan f lwqat!",
                "wa sahbi, chokran bzzaf!",
                "l3ziza 3liya had lklamat, chokran!",
                "nta li mezyan, chokran sa7bi!",
                "ah chokran, hadchi f rassek!",
                "nta zwin had lmra, chokran!"
            ],
            why: [
                "3lach? had su'al mhm. nta baghi t'aref lhaja...",
                "3lach? sara7a, had lhaja liha tafsir.",
                "ah 3lach, nshre7 lik b lmaqoul...",
                "3lach? ila baghi t'aref, hadi hiya l9issa...",
                "3lach nta sawwal? mzyan nchre7 lik.",
                "wach baghi t'aref 3lach? safi..."
            ],
            farewell: [
                "bslama, tban 3la khir!",
                "allah y3awnek, nchlh nta tban lkhir",
                "bslama, t3ayt lya f waqt okhr",
                "nchlh nta tb9a f lkhir, bslama",
                "allaah ysahal, bslama",
                "bslama, tban 3la khir sa7bi"
            ],
            default: [
                "ah, hna nsma3 lik. chno baghi t9oul bdabt?",
                "sara7a, fhemtek nta. safi goul liya chno khassek.",
                "hna hna, goul liya chno baghi w n3awnek.",
                "ah sahbi, hadchi sahla. goul liya chno khassek.",
                "wakha, nta goul w ana n3awnek.",
                "hna m3ak, goul chno baghi tsewwel 3lih.",
                "safi, nta hder w ana nsma3 lik 3la rasek.",
                "ah, hna hna f lkhidma. goul liya chno mochkiltek."
            ]
        };
        
        // Natural Arabic responses
        this.arabicResponses = {
            greetings: [
                "وعليكم السلام ورحمة الله، كيف الحال؟",
                "اهلا وسهلا، كيف تقدر أساعدك؟",
                "مرحباً، شلونك اليوم؟",
                "السلام عليكم، أهلاً بك",
                "وعليكم السلام، نورت"
            ],
            howAreYou: [
                "الحمد لله بخير، كيف انت؟",
                "بخير شكراً، وانت كيفك؟",
                "الحمد لله، شو اخبارك؟",
                "تمام، قول لي كيف أقدر أخدمك",
                "بخير، شو بدك تسأل؟"
            ],
            thanks: [
                "عفواً، هذا واجبي",
                "العفو، تحت أمرك",
                "اهلاً وسهلاً، في الخدمة",
                "على الرحب والسعة",
                "عفواً، اتصل بنا في اي وقت"
            ],
            default: [
                "اهلاً، قول لي شو بدك تسأل؟",
                "مرحباً، كيف اقدر اساعدك؟",
                "اهلاً، انا هنا للمساعدة",
                "قول لي، شو الي ببالك؟"
            ]
        };
        
        // Natural French responses
        this.frenchResponses = {
            greetings: [
                "Salut! Comment ca va?",
                "Bonjour! Comment puis-je t'aider?",
                "Hey! Quoi de neuf?",
                "Salut! Tu vas bien?",
                "Coucou! Comment ca se passe?"
            ],
            howAreYou: [
                "Ca va super, merci! Et toi?",
                "Tres bien, merci! Tu as besoin de quoi?",
                "Nickel, et toi? Comment tu vas?",
                "Impeccable! Qu'est-ce que tu veux savoir?"
            ],
            thanks: [
                "Avec plaisir! Tu me dis si t'as besoin d'autre chose",
                "De rien! C'est normal",
                "Pas de soucis! Je suis la pour ca",
                "Derien! N'hesite pas si t'as des questions"
            ],
            default: [
                "Salut! Qu'est-ce que tu veux savoir?",
                "Coucou! Comment je peux t'aider?",
                "Hey! Tu as besoin de quelque chose?",
                "Allo! Dis moi ce que tu cherches"
            ]
        };
        
        // Natural English responses
        this.englishResponses = {
            greetings: [
                "Hey there! How's it going?",
                "Hello! What's up?",
                "Hi! How can I help you?",
                "Hey! Good to see you!",
                "Hello there! What do you need?"
            ],
            howAreYou: [
                "I'm doing great, thanks for asking! How about you?",
                "Pretty good! What's on your mind?",
                "All good here! What can I do for you?",
                "Doing well, thanks! What's up?"
            ],
            thanks: [
                "You're welcome! Happy to help!",
                "No problem! Let me know if you need anything else",
                "Anytime! That's what I'm here for",
                "My pleasure! Don't hesitate to ask more"
            ],
            farewell: [
                "Take care! See you later!",
                "Goodbye! Have a great day!",
                "See ya! Catch you later!",
                "Bye! Come back anytime!"
            ],
            default: [
                "Hey! What would you like to know?",
                "Hi there! How can I help you today?",
                "Hello! What's going on?",
                "Hey! Tell me what you need"
            ]
        };
    }

    detectLanguage(text) {
        const lowercaseText = text.toLowerCase();
        
        // Darija detection (Moroccan Arabic - natural conversation)
        const darijaPatterns = [
            'slm', 'labas', 'wakha', 'ila', '3lach', 'hna', 'daba', 'bzzaf', 'shwiya', 'mzyan', 
            'kidayr', 'baghi', 'chno', 'wach', 'ash', 't9wd', 'ry7', 'bhal', 'm3a', '3ndi', 
            '9rib', 'b3id', 'ah', 'la', 'sahbi', 'sa7bi', 'mra', 'lkheir', 'wakh', 'bghit',
            'hder', 'sara7a', 'bdabt', 'khassek', 'n3awnek', 't9oul', 'goul', 'tsewwel', '3likom'
        ];
        
        let darijaCount = 0;
        for (const word of darijaPatterns) {
            if (lowercaseText.includes(word)) darijaCount++;
        }
        if (darijaCount >= 1) return 'darija';
        
        // Check for common Moroccan Darija short forms
        if (lowercaseText === 'slm' || lowercaseText === 'salam' || lowercaseText === 'ahlan' || 
            lowercaseText === 'labass' || lowercaseText === 'labas') return 'darija';
        
        // Arabic detection
        const arabicPattern = /[\u0600-\u06FF]/;
        if (arabicPattern.test(text)) return 'arabic';
        
        // French detection
        const frenchWords = ['bonjour', 'salut', 'comment', 'merci', 'ca va', 'bien', 'tres', 'pourquoi', 'quoi', 'oui', 'non', 'ami', 'maison'];
        let frenchCount = 0;
        for (const word of frenchWords) {
            if (lowercaseText.includes(word)) frenchCount++;
        }
        if (frenchCount >= 1) return 'french';
        
        // Default English
        return 'english';
    }

    getRandomResponse(responses) {
        return responses[Math.floor(Math.random() * responses.length)];
    }

    generateResponse(question, userId) {
        try {
            // Get or detect language
            let language = this.userLanguage.get(userId);
            if (!language) {
                language = this.detectLanguage(question);
                this.userLanguage.set(userId, language);
                
                // Reset after 30 minutes of inactivity
                setTimeout(() => {
                    if (this.userLanguage.get(userId) === language) {
                        this.userLanguage.delete(userId);
                        this.conversationHistory.delete(userId);
                    }
                }, 1800000);
            }
            
            const lowerQuestion = question.toLowerCase();
            let response = "";
            
            // Language-specific response generation with natural patterns
            switch(language) {
                case 'darija':
                    // Check for different patterns
                    if (lowerQuestion === 'slm' || lowerQuestion === 'salam' || lowerQuestion.includes('slm')) {
                        response = this.getRandomResponse(this.darijaResponses.greetings);
                    } else if (lowerQuestion.includes('labas') || lowerQuestion.includes('kidayr') || lowerQuestion.includes('kifash')) {
                        response = this.getRandomResponse(this.darijaResponses.howAreYou);
                    } else if (lowerQuestion.includes('shukran') || lowerQuestion.includes('merci') || lowerQuestion.includes('chokran')) {
                        response = this.getRandomResponse(this.darijaResponses.thanks);
                    } else if (lowerQuestion.includes('wach') || lowerQuestion.includes('ash') || lowerQuestion.includes('chno') || lowerQuestion.includes('chhal')) {
                        response = this.getRandomResponse(this.darijaResponses.askQuestion);
                    } else if (lowerQuestion.includes('7elwa') || lowerQuestion.includes('zwin') || lowerQuestion.includes('mzyan')) {
                        response = this.getRandomResponse(this.darijaResponses.compliment);
                    } else if (lowerQuestion.includes('3lach') || lowerQuestion.includes('lach')) {
                        response = this.getRandomResponse(this.darijaResponses.why);
                    } else if (lowerQuestion.includes('bslama') || lowerQuestion.includes('bye') || lowerQuestion.includes('salamt')) {
                        response = this.getRandomResponse(this.darijaResponses.farewell);
                    } else {
                        response = this.getRandomResponse(this.darijaResponses.default);
                    }
                    break;
                    
                case 'arabic':
                    if (lowerQuestion.includes('السلام') || lowerQuestion.includes('اهلا') || lowerQuestion.includes('مرحبا')) {
                        response = this.getRandomResponse(this.arabicResponses.greetings);
                    } else if (lowerQuestion.includes('كيف') || lowerQuestion.includes('حالك')) {
                        response = this.getRandomResponse(this.arabicResponses.howAreYou);
                    } else if (lowerQuestion.includes('شكر') || lowerQuestion.includes('مشكور')) {
                        response = this.getRandomResponse(this.arabicResponses.thanks);
                    } else {
                        response = this.getRandomResponse(this.arabicResponses.default);
                    }
                    break;
                    
                case 'french':
                    if (lowerQuestion.includes('bonjour') || lowerQuestion.includes('salut') || lowerQuestion.includes('coucou')) {
                        response = this.getRandomResponse(this.frenchResponses.greetings);
                    } else if (lowerQuestion.includes('comment') || lowerQuestion.includes('ca va')) {
                        response = this.getRandomResponse(this.frenchResponses.howAreYou);
                    } else if (lowerQuestion.includes('merci')) {
                        response = this.getRandomResponse(this.frenchResponses.thanks);
                    } else {
                        response = this.getRandomResponse(this.frenchResponses.default);
                    }
                    break;
                    
                default: // English
                    if (lowerQuestion.includes('hello') || lowerQuestion.includes('hi') || lowerQuestion.includes('hey')) {
                        response = this.getRandomResponse(this.englishResponses.greetings);
                    } else if (lowerQuestion.includes('how are you') || lowerQuestion.includes('how do you do')) {
                        response = this.getRandomResponse(this.englishResponses.howAreYou);
                    } else if (lowerQuestion.includes('thank') || lowerQuestion.includes('thanks')) {
                        response = this.getRandomResponse(this.englishResponses.thanks);
                    } else if (lowerQuestion.includes('bye') || lowerQuestion.includes('goodbye') || lowerQuestion.includes('see you')) {
                        response = this.getRandomResponse(this.englishResponses.farewell);
                    } else {
                        response = this.getRandomResponse(this.englishResponses.default);
                    }
                    break;
            }
            
            // Store conversation history
            let history = this.conversationHistory.get(userId) || [];
            history.push({ user: question, assistant: response });
            if (history.length > 5) history = history.slice(-5);
            this.conversationHistory.set(userId, history);
            
            return response;
            
        } catch (error) {
            console.error('AI Response Error:', error);
            if (this.userLanguage.get(userId) === 'darija') {
                return "sara7a, chwiya t9ayad. 3awed su'al b tariqa okhra.";
            }
            return "❌ Sorry, I encountered an error. Please try again.";
        }
    }

    getStats() {
        return {
            activeUsers: this.conversationHistory.size,
            languages: {
                darija: Array.from(this.userLanguage.values()).filter(l => l === 'darija').length,
                arabic: Array.from(this.userLanguage.values()).filter(l => l === 'arabic').length,
                french: Array.from(this.userLanguage.values()).filter(l => l === 'french').length,
                english: Array.from(this.userLanguage.values()).filter(l => l === 'english').length
            }
        };
    }
}

module.exports = AIConfig;
