#!/usr/bin/env ruby
# Validate the files agents load without requiring a package installation.
require 'yaml'
require 'json'
require 'pathname'
require 'uri'

Encoding.default_external = Encoding::UTF_8

root = Pathname.new(ARGV.fetch(0, File.expand_path('..', __dir__))).expand_path
errors = []
names = {}
skills = Dir[root.join('skills/*/SKILL.md').to_s].sort
errors << 'No skills found' if skills.empty?

skills.each do |file|
  path = Pathname.new(file)
  relative = path.relative_path_from(root)
  text = path.read
  header = text.match(/\A---\r?\n(.*?)\r?\n---(?:\r?\n|\z)/m)
  unless header
    errors << "#{relative}: missing YAML frontmatter"
    next
  end

  begin
    data = YAML.safe_load(header[1])
    unless data.is_a?(Hash)
      errors << "#{relative}: frontmatter must be a mapping"
      next
    end
    name = data['name']
    description = data['description']
    unless name.is_a?(String) && name.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/) && name.length <= 64
      errors << "#{relative}: invalid skill name"
    end
    errors << "#{relative}: name must match directory" unless name == path.dirname.basename.to_s
    errors << "#{relative}: duplicate skill name #{name}" if names.key?(name)
    names[name] = file
    unless description.is_a?(String) && !description.strip.empty? && description.length <= 1024 && !description.match?(/[<>]/)
      errors << "#{relative}: invalid description"
    end
    if data.key?('disable-model-invocation') && ![true, false].include?(data['disable-model-invocation'])
      errors << "#{relative}: disable-model-invocation must be boolean"
    end
    if name.to_s.start_with?('principle-') && data['disable-model-invocation'] != true
      errors << "#{relative}: principles load through tblock-mode and need disable-model-invocation: true"
    end
  rescue Psych::Exception => e
    errors << "#{relative}: #{e.message}"
  end
end

documents = Dir[root.join('skills/**/*.md').to_s].sort
documents << root.join('README.md').to_s if root.join('README.md').file?
link_count = 0
documents.each do |file|
  path = Pathname.new(file)
  relative = path.relative_path_from(root)
  fence = nil
  path.each_line.with_index(1) do |line, number|
    marker = line.match(/^\s*(`{3,}|~{3,})/)
    if marker
      token = marker[1]
      if fence.nil?
        fence = token
      elsif token[0] == fence[0] && token.length >= fence.length
        fence = nil
      end
      next
    end
    next if fence
    errors << "#{relative}:#{number}: unfinished TODO" if line.match?(/^\s*\[TODO:/)
    line.scan(/\[[^\]]*\]\(([^)]+)\)/).flatten.each do |raw|
      target = raw.strip.sub(/\A<(.+)>\z/, '\\1')
      next if target.start_with?('#') || target.match?(/\A[a-z][a-z0-9+.-]*:/i)
      target = URI::DEFAULT_PARSER.unescape(target.split('#', 2).first)
      link_count += 1
      errors << "#{relative}:#{number}: missing link target #{target}" unless path.dirname.join(target).exist?
    end
  end
end

mode = root.join('skills/tblock-mode/SKILL.md')
if mode.file?
  routed = mode.read.scan(%r{\]\(\.\./(principle-[a-z0-9-]+)/SKILL\.md\)}).flatten
  (names.keys.grep(/\Aprinciple-/) - routed).sort.each do |name|
    errors << "skills/#{name}/SKILL.md: not linked from tblock-mode, so nothing loads it"
  end
end

setup = root.join('skills/setup-tblock/SKILL.md')
if setup.file?
  roles = setup.read.split(/^## /).find { |s| s.start_with?('Roles') }.to_s.scan(/^\| `([a-z ]+)` \|/).flatten
  users = (Dir[root.join('skills/**/*.md').to_s] + Dir[root.join('agents/*.md').to_s]).reject { |f| f == setup.to_s }.map { |f| File.read(f) }
  roles.each do |role|
    errors << "skills/setup-tblock/SKILL.md: role `#{role}` is configured but no skill or agent uses it" unless users.any? { |text| text.include?("`#{role}`") }
  end
end

split_agent = lambda do |file|
  match = File.read(file).match(/\A---\r?\n(.*?)\r?\n---\r?\n(.*)\z/m)
  match ? [YAML.safe_load(match[1]), match[2]] : [nil, nil]
end
claude_agents = Dir[root.join('agents/*.md').to_s].map { |f| File.basename(f, '.md') }
copilot_agents = Dir[root.join('com.github.copilot/agents/*.agent.md').to_s].map { |f| File.basename(f, '.agent.md') }
(claude_agents | copilot_agents).sort.each do |name|
  claude = root.join("agents/#{name}.md")
  copilot = root.join("com.github.copilot/agents/#{name}.agent.md")
  unless claude.file? && copilot.file?
    errors << "agent #{name}: needs both agents/#{name}.md (Claude Code) and com.github.copilot/agents/#{name}.agent.md (Copilot)"
    next
  end
  claude_head, claude_body = split_agent.call(claude)
  copilot_head, copilot_body = split_agent.call(copilot)
  if claude_head.nil? || copilot_head.nil?
    errors << "agent #{name}: missing YAML frontmatter"
  elsif claude_body != copilot_body || %w[name description].any? { |key| claude_head[key] != copilot_head[key] }
    errors << "agent #{name}: Claude Code and Copilot copies differ in name, description, or body"
  end
end

presets_file = root.join('presets.json')
if presets_file.file? && setup.file?
  roles = setup.read.split(/^## /).find { |s| s.start_with?('Roles') }.to_s.scan(/^\| `([a-z ]+)` \|/).flatten
  data = JSON.parse(presets_file.read)
  tiers = data.fetch('tiers', []) + ['session']
  (data['presets'] || {}).each do |preset, spec|
    errors << "presets.json: #{preset} misses #{(roles - spec.keys).join(', ')}" unless (roles - spec.keys).empty?
    errors << "presets.json: #{preset} has unknown roles #{(spec.keys - roles).join(', ')}" unless (spec.keys - roles).empty?
    spec.each do |role, want|
      errors << "presets.json: #{preset}.#{role} effort #{want['effort']} is not a known effort" unless data['efforts'].include?(want['effort'])
      errors << "presets.json: #{preset}.#{role} tier #{want['tier']} is not a known tier" unless tiers.include?(want['tier'])
      if want['tier'] != 'session' && !want['panel'] && !data['families'].include?(want['family'])
        errors << "presets.json: #{preset}.#{role} needs a family from #{data['families'].join(', ')}"
      end
    end
  end
end

manifests = {}
Dir[root.join('{plugin.json,.claude-plugin/*.json}').to_s].sort.each do |file|
  begin
    manifests[Pathname.new(file).relative_path_from(root).to_s] = JSON.parse(File.read(file))
  rescue JSON::ParserError => e
    errors << "#{Pathname.new(file).relative_path_from(root)}: #{e.message}"
  end
end

reference = manifests['.claude-plugin/plugin.json']
if reference
  manifests.reject { |file, _| file == '.claude-plugin/plugin.json' }.each do |file, data|
    %w[name version description].each do |key|
      errors << "#{file}: #{key} differs from .claude-plugin/plugin.json" unless data[key] == reference[key]
    end
  end

  marketplace = root.join('../.claude-plugin/marketplace.json')
  if marketplace.file?
    entry = JSON.parse(marketplace.read).fetch('plugins', []).find { |plugin| plugin['name'] == reference['name'] }
    if entry.nil?
      errors << "marketplace.json: no entry for #{reference['name']}"
    elsif entry['version'] != reference['version']
      errors << "marketplace.json: #{reference['name']} version #{entry['version']} differs from #{reference['version']}"
    end
  end
end

unless errors.empty?
  warn errors.join("\n")
  exit 1
end
puts "Validated #{skills.length} skills, #{documents.length} Markdown files, and #{link_count} local links; principles are routed and manifests agree."
