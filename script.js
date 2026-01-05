        let allData = [];
        let currentFilteredData = [];
        let isLoginMode = true;
        let filterableColumns = ['Bid_End_Date_Time', 'Bid_Opening_Date_Time', 'Bid_Offer_Validity__From_End_Date_', 'Ministry_State_Name', 'Department_Name', 'Organisation_Name', 'Office_Name', 'Buyer_Email_ID', 'Item_Category', 'Similar_Category', 'Contract_Period', 'Minimum_Average_Annual_Turnover__3_Years_', 'Years_of_Past_Experience_Required', 'MSE_Exemption_for_Experience_and_Turnover', 'Startup_Exemption_for_Experience_and_Turnover', 'Documents_Required_From_Seller', 'Show_Uploaded_Bidder_Documents_To_All', 'Bid_to_RA_Enabled', 'RA_Qualification_Rule', 'Type_of_Bid', 'Time_Allowed_for_Technical_Clarifications', 'Floor_Price', 'Estimated_Bid_Value', 'Evaluation_Method', 'Financial_Document_Price_Breakup_Required', 'Arbitration_Clause', 'Mediation_Clause', 'Advisory_Bank', 'EMD_Amount', 'ePBG_Detail_Requirement', 'ePBG_Percentage', 'Duration_of_ePBG', 'Splitting_Applied', 'Maximum_Bidders', 'Split_Criteria', 'MII_Compliance', 'MSE_Purchase_Preference', 'Pre_Bid_Date_Time', 'Pre_Bid_Venue', 'Consignee_Reporting_Officer', 'Tender_City'];

        // Check login status on load
        async function checkAuth() {
            try {
                const res = await fetch('http://localhost:5050/api/user', { credentials: 'include' });
                const data = await res.json();
                if (data.logged_in) {
                    document.getElementById('loginOverlay').classList.add('hidden');
                    document.getElementById('userInfo').style.display = 'flex';
                    document.getElementById('usernameDisplay').textContent = data.username;
                    loadChatHistory();
                }
            } catch (e) {}
        }
        
        function formatSummary(text) {
            return text.replace(/\n/g, '<br>').replace(/•/g, '&bull;');
        }
        
        async function loadChatHistory() {
            try {
                const res = await fetch('http://localhost:5050/api/chat-history', { credentials: 'include' });
                const data = await res.json();
                const chatMessages = document.getElementById('chatMessages');
                chatMessages.innerHTML = '';
                currentChatFilters = {};
                
                data.history.forEach(([role, msg]) => {
                    if (role === 'user') {
                        chatMessages.innerHTML += `<div class="chat-message user"><div class="msg-bubble">${msg}</div></div>`;
                    } else {
                        let text = msg, cards = '';
                        const summaryMatch = msg.match(/SUMMARY:([\s\S]*)/);
                        text = summaryMatch ? formatSummary(summaryMatch[1].trim()) : msg;
                        
                        if (msg.startsWith('FILTERS:')) {
                            try {
                                const filterMatch = msg.match(/FILTERS:(\{.*\})/);
                                if (filterMatch) {
                                    const filters = JSON.parse(filterMatch[1]);
                                    const results = getFilteredResults(filters);
                                    cards = `<div class="chat-cards">${results.map(r => `
                                        <div class="chat-card" onclick="showModal(${allData.indexOf(r)})">
                                            <div class="chat-card-title">${(r.Item_Category || 'N/A').substring(0, 60)}${(r.Item_Category || '').length > 60 ? '...' : ''}</div>
                                            <div class="chat-card-info">${r.Ministry_State_Name || 'N/A'}<br>${r.Tender_City || 'N/A'}</div>
                                            <div class="chat-card-value">${r.Estimated_Bid_Value || 'N/A'}</div>
                                        </div>
                                    `).join('')}</div>`;
                                }
                            } catch(e) { console.log('Filter parse error:', e); }
                        }
                        chatMessages.innerHTML += `<div class="chat-message bot"><div class="msg-bubble">${text}${cards}</div></div>`;
                    }
                });
                chatMessages.scrollTop = chatMessages.scrollHeight;
            } catch (e) {}
        }
        function toggleAuthMode() {
            isLoginMode = !isLoginMode;
            document.getElementById('authTitle').textContent = isLoginMode ? 'Login' : 'Sign Up';
            document.getElementById('authBtn').textContent = isLoginMode ? 'Login' : 'Create Account';
            document.querySelector('.auth-switch').innerHTML = isLoginMode 
                ? "Don't have an account? <span onclick=\"toggleAuthMode()\">Sign Up</span>"
                : "Already have an account? <span onclick=\"toggleAuthMode()\">Login</span>";
            document.getElementById('authError').textContent = '';
        }

        async function handleAuth() {
            const username = document.getElementById('authUsername').value.trim();
            const password = document.getElementById('authPassword').value;
            const errorEl = document.getElementById('authError');
            
            if (!username || !password) { errorEl.textContent = 'Please fill all fields'; return; }
            
            const endpoint = isLoginMode ? '/api/login' : '/api/signup';
            try {
                const res = await fetch('http://localhost:5050' + endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                
                if (data.success) {
                    if (!isLoginMode) { toggleAuthMode(); errorEl.textContent = ''; alert('Account created! Please login.'); return; }
                    document.getElementById('loginOverlay').classList.add('hidden');
                    document.getElementById('userInfo').style.display = 'flex';
                    document.getElementById('usernameDisplay').textContent = data.username;
                    loadChatHistory();
                } else {
                    errorEl.textContent = data.message;
                }
            } catch (e) { errorEl.textContent = 'Connection error'; }
        }

        async function logout() {
            await fetch('http://localhost:5050/api/logout', { method: 'POST', credentials: 'include' });
            document.getElementById('loginOverlay').classList.remove('hidden');
            document.getElementById('userInfo').style.display = 'none';
        }

        async function newSession() {
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = `
                <div class="chat-message bot">
                    <div class="msg-bubble">Hello! I can help you find tenders. Try asking:<br>• "Show defence ministry tenders"<br>• "Tenders above 10 lakhs"<br>• "IT tenders in Mumbai"</div>
                </div>
            `;
            currentChatFilters = {};
            document.getElementById('aiPrompt').value = '';
            chatMessages.scrollTop = 0;
            
            try {
                await fetch('http://localhost:5050/api/new-session', {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (error) {
                console.error('Error creating new session:', error);
            }
        }

        function switchMode(mode) {
            const filterSection = document.getElementById('filterSection');
            const aiSection = document.getElementById('aiSearchSection');
            const cardsGrid = document.getElementById('cardsGrid');
            const stats = document.querySelector('.stats');
            const modeBtns = document.querySelectorAll('.mode-btn');
            
            modeBtns.forEach(btn => btn.classList.remove('active'));
            
            if (mode === 'ai') {
                filterSection.style.display = 'none';
                cardsGrid.style.display = 'none';
                stats.style.display = 'none';
                aiSection.classList.add('active');
                modeBtns[1].classList.add('active');
                currentChatFilters = {}; // Reset filters for new chat session
            } else {
                filterSection.style.display = 'block';
                cardsGrid.style.display = 'grid';
                stats.style.display = 'flex';
                aiSection.classList.remove('active');
                modeBtns[0].classList.add('active');
            }
        }

        async function searchWithAI() {
            const input = document.getElementById('aiPrompt');
            const prompt = input.value.trim();
            if (!prompt) return;
            
            const btn = document.getElementById('aiSearchBtn');
            const chatMessages = document.getElementById('chatMessages');
            
            // Add user message
            chatMessages.innerHTML += `<div class="chat-message user"><div class="msg-bubble">${prompt}</div></div>`;
            input.value = '';
            
            // Add typing indicator
            const typingId = 'typing-' + Date.now();
            chatMessages.innerHTML += `<div class="chat-message bot" id="${typingId}"><div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            btn.disabled = true;
            
            let filteredResults = [];
            
            try {
                const response = await fetch('http://localhost:5050/api/ai-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: prompt, data: allData })
                });
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let summaryText = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.type === 'filters') {
                                try {
                                    const filters = JSON.parse(data.content);
                                    filteredResults = getFilteredResults(filters);
                                    console.log('Filters:', filters, 'Results:', filteredResults.length);
                                } catch (e) { console.error('Filter error:', e); }
                            } else if (data.type === 'summary') {
                                summaryText += data.content;
                            }
                        }
                    }
                }
                
                // Only show results from AI filters, no fallback search
                
                // Remove typing indicator
                document.getElementById(typingId)?.remove();
                
                // Show cards directly without summary
                if (filteredResults.length > 0) {
                    const cardsHtml = `<div class="chat-cards">${filteredResults.map((row, i) => `
                        <div class="chat-card" onclick="showModal(${allData.indexOf(row)})">
                            <div class="chat-card-title">${(row.Item_Category || 'N/A').substring(0, 60)}${(row.Item_Category || '').length > 60 ? '...' : ''}</div>
                            <div class="chat-card-info">${row.Ministry_State_Name || 'N/A'}<br>${row.Tender_City || 'N/A'}</div>
                            <div class="chat-card-value">${row.Estimated_Bid_Value || 'N/A'}</div>
                        </div>
                    `).join('')}</div>`;
                    chatMessages.innerHTML += `<div class="chat-message bot"><div class="msg-bubble">Found ${filteredResults.length} matching tender(s)${cardsHtml}</div></div>`;
                    
                    // Extract specific information from filtered results
                    const extractId = 'extract-' + Date.now();
                    chatMessages.innerHTML += `<div class="chat-message bot" id="${extractId}"><div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>`;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    
                    try {
                        const extractResponse = await fetch('http://localhost:5050/api/extract-info', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ query: prompt, filteredResults: filteredResults })
                        });
                        
                        const extractReader = extractResponse.body.getReader();
                        const extractDecoder = new TextDecoder();
                        let extractText = '';
                        
                        while (true) {
                            const { done, value } = await extractReader.read();
                            if (done) break;
                            
                            const chunk = extractDecoder.decode(value);
                            const lines = chunk.split('\n');
                            
                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    const data = JSON.parse(line.slice(6));
                                    if (data.type === 'content') {
                                        extractText += data.content;
                                    }
                                }
                            }
                        }
                        
                        document.getElementById(extractId)?.remove();
                        if (extractText.trim()) {
                            // Convert **text** to <strong>text</strong>
                            const formattedText = extractText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
                            chatMessages.innerHTML += `<div class="chat-message bot"><div class="msg-bubble">${formattedText}</div></div>`;
                        }
                    } catch (e) {
                        document.getElementById(extractId)?.remove();
                    }
                } else {
                    chatMessages.innerHTML += `<div class="chat-message bot"><div class="msg-bubble">No matching tenders found.</div></div>`;
                }
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
            } catch (error) {
                document.getElementById(typingId)?.remove();
                chatMessages.innerHTML += `<div class="chat-message bot"><div class="msg-bubble">Error connecting to AI. Make sure backend is running.</div></div>`;
            } finally {
                btn.disabled = false;
            }
        }
        
        let currentChatFilters = {}; // Track accumulated filters in chat
        
        function getFilteredResults(filters) {
            // Merge new filters with existing chat filters
            currentChatFilters = { ...currentChatFilters, ...filters };
            
            let filtered = [...allData];
            
            for (const [key, value] of Object.entries(currentChatFilters)) {
                if (key.startsWith('_')) continue;
                if (value && typeof value === 'object' && value.op) {
                    const numVal = parseFloat(value.value);
                    filtered = filtered.filter(row => {
                        const rowVal = parseFloat(String(row[key] || '').replace(/[^0-9.-]/g, ''));
                        if (isNaN(rowVal)) return false;
                        if (value.op === 'gt') return rowVal > numVal;
                        if (value.op === 'lt') return rowVal < numVal;
                        if (value.op === 'gte') return rowVal >= numVal;
                        if (value.op === 'lte') return rowVal <= numVal;
                        return rowVal === numVal;
                    });
                } else if (value) {
                    const searchVal = String(value).toLowerCase();
                    filtered = filtered.filter(row => {
                        const rowVal = String(row[key] || '').toLowerCase();
                        return rowVal && rowVal !== 'n/a' && rowVal !== '' && rowVal.includes(searchVal);
                    });
                }
            }
            
            if (currentChatFilters._sort) {
                filtered.sort((a, b) => {
                    const aVal = parseFloat(String(a[currentChatFilters._sort] || '').replace(/[^0-9.-]/g, '')) || 0;
                    const bVal = parseFloat(String(b[currentChatFilters._sort] || '').replace(/[^0-9.-]/g, '')) || 0;
                    return currentChatFilters._order === 'desc' ? bVal - aVal : aVal - bVal;
                });
            }
            
            if (currentChatFilters._limit) filtered = filtered.slice(0, parseInt(currentChatFilters._limit));
            return filtered;
        }

        function applyAIFilters(filters) {
            console.log('applyAIFilters called with:', filters);
            console.log('allData length:', allData.length);
            let filtered = [...allData];
            let sortField = null;
            let sortOrder = 'asc';
            let limit = null;
            
            for (const [key, value] of Object.entries(filters)) {
                if (key === '_sort') {
                    sortField = value;
                } else if (key === '_order') {
                    sortOrder = value;
                } else if (key === '_limit') {
                    limit = parseInt(value);
                } else if (value && typeof value === 'object' && value.op) {
                    // Numeric comparison
                    const numVal = parseFloat(value.value);
                    filtered = filtered.filter(row => {
                        const rowVal = parseFloat(String(row[key]).replace(/[^0-9.-]/g, ''));
                        if (isNaN(rowVal)) return false;
                        if (value.op === 'gt') return rowVal > numVal;
                        if (value.op === 'lt') return rowVal < numVal;
                        if (value.op === 'gte') return rowVal >= numVal;
                        if (value.op === 'lte') return rowVal <= numVal;
                        return rowVal === numVal;
                    });
                } else if (value && allData[0] && allData[0].hasOwnProperty(key)) {
                    filtered = filtered.filter(row => 
                        row[key] && row[key].toLowerCase().includes(value.toLowerCase())
                    );
                }
            }
            
            // Sort
            if (sortField) {
                filtered.sort((a, b) => {
                    let aVal = a[sortField] || '';
                    let bVal = b[sortField] || '';
                    // Try numeric sort
                    const aNum = parseFloat(String(aVal).replace(/[^0-9.-]/g, ''));
                    const bNum = parseFloat(String(bVal).replace(/[^0-9.-]/g, ''));
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        return sortOrder === 'desc' ? bNum - aNum : aNum - bNum;
                    }
                    // String sort
                    return sortOrder === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
                });
            }
            
            // Limit
            if (limit && limit > 0) {
                filtered = filtered.slice(0, limit);
            }
            
            currentFilteredData = filtered;
            displayData(filtered);
            updateStats(filtered);
        }

        async function loadData() {
            console.log('loadData called');
            try {
                const response = await fetch('hackdemo_database.sql');
                console.log('Fetch response:', response.ok);
                if (!response.ok) throw new Error('Failed to load hackdemo_database1.sql');
                
                const sqlText = await response.text();
                console.log('SQL loaded, length:', sqlText.length);
                const insertStart = sqlText.indexOf('VALUES');
                if (insertStart === -1) throw new Error('No VALUES found');
                
                const valuesSection = sqlText.substring(insertStart + 6);
                
                // Parse rows by tracking parentheses depth
                let currentRow = '';
                let depth = 0;
                let inQuotes = false;
                
                for (let i = 0; i < valuesSection.length; i++) {
                    const char = valuesSection[i];
                    const prev = valuesSection[i-1];
                    
                    if (char === "'" && prev !== '\\') {
                        inQuotes = !inQuotes;
                    }
                    
                    if (!inQuotes) {
                        if (char === '(') depth++;
                        if (char === ')') depth--;
                    }
                    
                    currentRow += char;
                    
                    if (depth === 0 && currentRow.trim().endsWith('),')) {
                        const rowData = currentRow.trim().slice(0, -1);
                        parseAndAddRow(rowData);
                        currentRow = '';
                    } else if (depth === 0 && currentRow.trim().endsWith(');')) {
                        const rowData = currentRow.trim().slice(0, -2);
                        parseAndAddRow(rowData);
                        break;
                    }
                }
                
                setupFilters();
                currentFilteredData = allData;
                displayData(allData);
                updateStats();
                hideLoader();
                
            } catch (error) {
                console.error('Load error:', error);
                document.getElementById('cardsGrid').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error loading data</div></div>';
                hideLoader();
            }
        }

        function parseAndAddRow(rowStr) {
            try {
                const values = parseRow(rowStr);
                const columns = ['File_Name', 'Bid_End_Date_Time', 'Bid_Opening_Date_Time', 'Bid_Offer_Validity__From_End_Date_', 'Ministry_State_Name', 'Department_Name', 'Organisation_Name', 'Office_Name', 'Buyer_Email_ID', 'Item_Category', 'Similar_Category', 'Contract_Period', 'Minimum_Average_Annual_Turnover__3_Years_', 'Years_of_Past_Experience_Required', 'MSE_Exemption_for_Experience_and_Turnover', 'Startup_Exemption_for_Experience_and_Turnover', 'Documents_Required_From_Seller', 'Show_Uploaded_Bidder_Documents_To_All', 'Bid_to_RA_Enabled', 'RA_Qualification_Rule', 'Type_of_Bid', 'Time_Allowed_for_Technical_Clarifications', 'Floor_Price', 'Estimated_Bid_Value', 'Evaluation_Method', 'Financial_Document_Price_Breakup_Required', 'Arbitration_Clause', 'Mediation_Clause', 'Advisory_Bank', 'EMD_Amount', 'ePBG_Detail_Requirement', 'ePBG_Percentage', 'Duration_of_ePBG', 'Splitting_Applied', 'Maximum_Bidders', 'Split_Criteria', 'MII_Compliance', 'MSE_Purchase_Preference', 'Pre_Bid_Date_Time', 'Pre_Bid_Venue', 'Technical_Specification_Description', 'Consignee_Reporting_Officer', 'Tender_City', 'Summary', 'Success_Critera', 'Scope_of_Work'];
                if (values.length === columns.length) {
                    const obj = {};
                    columns.forEach((col, i) => {
                        obj[col] = values[i] === 'NULL' ? '' : values[i];
                    });
                    allData.push(obj);
                }
            } catch (e) {
                console.log('Error parsing row:', e);
            }
        }

        function parseRow(rowStr) {
            const content = rowStr.slice(1, -1);
            const values = [];
            let current = '';
            let inQuotes = false;
            let depth = 0;
            
            for (let i = 0; i < content.length; i++) {
                const char = content[i];
                const prev = content[i-1];
                
                if (char === "'" && prev !== '\\') {
                    inQuotes = !inQuotes;
                    continue;
                }
                
                if (!inQuotes) {
                    if (char === '(') depth++;
                    if (char === ')') depth--;
                    
                    if (char === ',' && depth === 0) {
                        values.push(current.trim());
                        current = '';
                        continue;
                    }
                }
                
                current += char;
            }
            
            if (current.trim()) values.push(current.trim());
            return values;
        }

        function setupFilters() {
            const filtersDiv = document.getElementById('filters');
            filtersDiv.innerHTML = '';
            
            filterableColumns.forEach(col => {
                const uniqueValues = [...new Set(allData.map(row => row[col]).filter(val => val && val !== '' && val !== 'NULL' && val !== 'Information Not Available'))].sort();
                
                if (uniqueValues.length > 0) {
                    const filterGroup = document.createElement('div');
                    filterGroup.className = 'filter-group';
                    
                    const label = document.createElement('label');
                    label.textContent = col.replace(/_/g, ' ');
                    
                    const select = document.createElement('select');
                    select.id = `filter_${col}`;
                    select.innerHTML = '<option value="">All</option>';
                    
                    uniqueValues.forEach(value => {
                        const option = document.createElement('option');
                        option.value = value;
                        option.textContent = value.length > 40 ? value.substring(0, 40) + '...' : value;
                        select.appendChild(option);
                    });
                    
                    filterGroup.appendChild(label);
                    filterGroup.appendChild(select);
                    filtersDiv.appendChild(filterGroup);
                }
            });
        }

        function getFilteredData() {
            let filteredData = allData;
            
            filterableColumns.forEach(col => {
                const select = document.getElementById(`filter_${col}`);
                if (select && select.value) {
                    filteredData = filteredData.filter(row => row[col] === select.value);
                }
            });
            
            return filteredData;
        }

        function applyFilters() {
            const filteredData = getFilteredData();
            currentFilteredData = filteredData;
            displayData(filteredData);
            updateStats(filteredData);
        }

        function clearFilters() {
            filterableColumns.forEach(col => {
                const select = document.getElementById(`filter_${col}`);
                if (select) select.value = '';
            });
            currentFilteredData = allData;
            displayData(allData);
            updateStats();
        }

        function displayData(data) {
            const grid = document.getElementById('cardsGrid');
            
            if (data.length === 0) {
                grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No records found</div></div>';
                return;
            }
            
            grid.innerHTML = data.map((row, index) => {
                let itemCategory = row.Item_Category || 'N/A';
                if (itemCategory.length > 180) {
                    itemCategory = itemCategory.substring(0, 180) + '...';
                }
                
                return `
                <div class="card" onclick="showModal(${index})">
                    <div class="card-header">
                        <div class="card-title">${itemCategory}</div>
                        <div class="card-badge">${row.Type_of_Bid || 'N/A'}</div>
                    </div>
                    <div class="card-info">
                        <div class="info-row">
                            <div class="info-label">File Name:</div>
                            <div class="info-value">${row.File_Name || 'N/A'}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Ministry:</div>
                            <div class="info-value">${row.Ministry_State_Name || 'N/A'}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Department:</div>
                            <div class="info-value">${row.Department_Name || 'N/A'}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Organisation:</div>
                            <div class="info-value">${row.Organisation_Name || 'N/A'}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Contract Period:</div>
                            <div class="info-value">${row.Contract_Period || 'N/A'}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">City:</div>
                            <div class="info-value">${row.Tender_City || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="card-footer">
                        <div class="card-amount">Estimated Bid Value: ${row.Estimated_Bid_Value || 'N/A'}</div>
                    </div>
                </div>
            `;
            }).join('');
        }

        let currentModalTender = null;

        function showModal(index) {
            const row = currentFilteredData[index];
            currentModalTender = row;
            const columns = ['File_Name', 'Bid_End_Date_Time', 'Bid_Opening_Date_Time', 'Bid_Offer_Validity__From_End_Date_', 'Ministry_State_Name', 'Department_Name', 'Organisation_Name', 'Office_Name', 'Buyer_Email_ID', 'Item_Category', 'Similar_Category', 'Contract_Period', 'Minimum_Average_Annual_Turnover__3_Years_', 'Years_of_Past_Experience_Required', 'MSE_Exemption_for_Experience_and_Turnover', 'Startup_Exemption_for_Experience_and_Turnover', 'Documents_Required_From_Seller', 'Show_Uploaded_Bidder_Documents_To_All', 'Bid_to_RA_Enabled', 'RA_Qualification_Rule', 'Type_of_Bid', 'Time_Allowed_for_Technical_Clarifications', 'Floor_Price', 'Estimated_Bid_Value', 'Evaluation_Method', 'Financial_Document_Price_Breakup_Required', 'Arbitration_Clause', 'Mediation_Clause', 'Advisory_Bank', 'EMD_Amount', 'ePBG_Detail_Requirement', 'ePBG_Percentage', 'Duration_of_ePBG', 'Splitting_Applied', 'Maximum_Bidders', 'Split_Criteria', 'MII_Compliance', 'MSE_Purchase_Preference', 'Pre_Bid_Date_Time', 'Pre_Bid_Venue', 'Technical_Specification_Description', 'Consignee_Reporting_Officer', 'Tender_City', 'Summary', 'Success_Critera', 'Scope_of_Work'];
            
            document.getElementById('modalTitle').textContent = row.Item_Category || 'Details';
            
            const content = columns.map(col => `
                <div class="modal-row">
                    <div class="modal-label">${col.replace(/_/g, ' ')}:</div>
                    <div class="modal-value">${row[col] || 'N/A'}</div>
                </div>
            `).join('');
            
            document.getElementById('modalContent').innerHTML = content;
            document.getElementById('aiAnalysis').style.display = 'none';
            document.getElementById('aiAnalysis').textContent = '';
            document.getElementById('aiAnalyzeBtn').disabled = false;
            document.getElementById('aiAnalyzeBtn').textContent = 'AI Analyze';
            document.getElementById('modalOverlay').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        async function analyzeTender() {
            if (!currentModalTender) { alert('No tender selected'); return; }
            const btn = document.getElementById('aiAnalyzeBtn');
            const analysis = document.getElementById('aiAnalysis');
            
            btn.disabled = true;
            btn.textContent = 'Analyzing...';
            analysis.style.display = 'block';
            analysis.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            
            try {
                const response = await fetch('http://localhost:5050/api/analyze-tender', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tender: currentModalTender })
                });
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const lines = decoder.decode(value).split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = JSON.parse(line.slice(6));
                            if (data.type === 'content') {
                                fullText += data.content;
                            }
                        }
                    }
                }
                
                // Typewriter effect with markdown parsing
                const parseMarkdown = (text) => {
                    return text
                        .replace(/### (.*?)(\n|$)/g, '<strong style="font-size:15px;color:#1a2744;">$1</strong>\n')
                        .replace(/## (.*?)(\n|$)/g, '<strong style="font-size:16px;color:#1a2744;">$1</strong>\n')
                        .replace(/# (.*?)(\n|$)/g, '<strong style="font-size:17px;color:#1a2744;">$1</strong>\n')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/\n/g, '<br>');
                };
                
                analysis.innerHTML = '<span class="analysis-text"></span><span class="typing-cursor">|</span>';
                const textEl = analysis.querySelector('.analysis-text');
                let i = 0;
                let buffer = '';
                const typeWriter = () => {
                    if (i < fullText.length) {
                        buffer += fullText.charAt(i);
                        textEl.innerHTML = parseMarkdown(buffer);
                        i++;
                        setTimeout(typeWriter, 5);
                    } else {
                        analysis.querySelector('.typing-cursor')?.remove();
                        btn.textContent = 'Analysis Complete';
                    }
                };
                typeWriter();
            } catch (e) {
                analysis.innerHTML = 'Error: ' + e.message;
                btn.textContent = 'Failed';
            }
        }

        function closeModal(event) {
            if (event && event.target !== document.getElementById('modalOverlay')) return;
            document.getElementById('modalOverlay').classList.remove('active');
            document.body.style.overflow = 'auto';
        }

        function updateStats(filteredData = allData) {
            document.getElementById('totalRecords').textContent = allData.length;
            document.getElementById('filteredRecords').textContent = filteredData.length;
        }

        function hideLoader() {
            const loader = document.getElementById('loader');
            loader.classList.add('hidden');
            setTimeout(() => loader.style.display = 'none', 500);
        }

        loadData().then(() => checkAuth());
        
        // Enter key support for AI prompt
        document.addEventListener('DOMContentLoaded', () => {
            const aiPrompt = document.getElementById('aiPrompt');
            if (aiPrompt) {
                aiPrompt.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') searchWithAI();
                });
            }
        });
