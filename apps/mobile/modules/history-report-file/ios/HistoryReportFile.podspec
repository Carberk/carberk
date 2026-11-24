Pod::Spec.new do |s|
  s.name = 'HistoryReportFile'
  s.version = '0.1.0'
  s.summary = 'Present and export a private Vehicle History PDF'
  s.homepage = 'https://github.com/Carberk/carberk'
  s.license = 'UNLICENSED'
  s.author = 'Carberk'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { git: 'https://github.com/Carberk/carberk.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
